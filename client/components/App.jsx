import { useEffect, useRef, useState } from "react";
import logo from "/assets/jose-icon.png";
import EventLog from "./EventLog";
import SessionControls from "./SessionControls";
import ToolPanel from "./ToolPanel";

export default function App() {
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [events, setEvents] = useState([]);
  const [dataChannel, setDataChannel] = useState(null);
  const peerConnection = useRef(null);
  const audioElement = useRef(null);
  const [microphoneStatus, setMicrophoneStatus] = useState("waiting"); // For diagnostics

  async function startSession() {
    try {
      // Get an ephemeral key from the server
      const tokenResponse = await fetch("/token");
      const data = await tokenResponse.json();

      // Check if there's an error in the response
      if (data.error) {
        console.error("Token error:", data.error);
        alert("Error starting session: " + data.error);
        return;
      }

      // Check for client_secret before accessing it
      if (!data.client_secret || !data.client_secret.value) {
        console.error("Invalid token response format:", data);
        alert("Error: Invalid token response from API");
        return;
      }

      const EPHEMERAL_KEY = data.client_secret.value;

      // Create a peer connection
      const pc = new RTCPeerConnection({
        // Adding STUN servers to help with NAT traversal
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" }
        ]
      });

      // Set up WebRTC connection logging
      pc.addEventListener("connectionstatechange", () => {
        console.log("WebRTC Connection State:", pc.connectionState);
      });

      pc.addEventListener("iceconnectionstatechange", () => {
        console.log("ICE Connection State:", pc.iceConnectionState);
      });

      // Set up to play remote audio from the model
      audioElement.current = document.createElement("audio");
      audioElement.current.autoplay = true;
      audioElement.current.volume = 1.0; // Ensure volume is up
      document.body.appendChild(audioElement.current); // Add to DOM to ensure it works

      pc.ontrack = (e) => {
        console.log("Received audio track from model", e.streams[0]);
        audioElement.current.srcObject = e.streams[0];
        // Try to play audio as soon as track is received
        audioElement.current.play().catch(e => console.error("Audio play error:", e));
      };

      // Add local audio track for microphone input in the browser
      try {
        setMicrophoneStatus("requesting");
        const ms = await navigator.mediaDevices.getUserMedia({
          audio: true
        });
        setMicrophoneStatus("granted");
        console.log("Microphone access granted", ms.getAudioTracks()[0]);

        // Add audio track with some constraints to ensure good voice quality
        ms.getAudioTracks().forEach(track => {
          track.applyConstraints({
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          });
          pc.addTrack(track, ms);
        });
      } catch (error) {
        console.error("Error accessing microphone:", error);
        setMicrophoneStatus("denied");
        alert("Microphone access denied. Please allow microphone access and try again.");
        return;
      }

      // Set up data channel for sending and receiving events
      const dc = pc.createDataChannel("oai-events");

      dc.onopen = () => {
        console.log("Data channel opened");

        // Send an initial message to start the conversation when the channel opens
        setTimeout(() => {
          const welcomeEvent = {
            type: "conversation.item.create",
            item: {
              type: "message",
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: "Hello Jose, can you introduce yourself?",
                },
              ],
            },
          };
          sendClientEvent(welcomeEvent);
          sendClientEvent({ type: "response.create" });
        }, 1000); // Wait a second for everything to stabilize
      };

      dc.onclose = () => console.log("Data channel closed");
      dc.onerror = (e) => console.error("Data channel error:", e);

      dc.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          console.log("Received message from model:", data);
          setEvents((prev) => [data, ...prev]);
        } catch (error) {
          console.error("Error parsing data channel message:", error);
        }
      };

      setDataChannel(dc);

      // Start the session using the Session Description Protocol (SDP)
      const offer = await pc.createOffer({
        offerToReceiveAudio: true
      });
      console.log("Created offer", offer);
      await pc.setLocalDescription(offer);

      const baseUrl = "https://api.openai.com/v1/realtime";
      const model = "gpt-4o-realtime-preview-2024-12-17";
      console.log("Sending request to OpenAI Realtime API");
      const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${EPHEMERAL_KEY}`,
          "Content-Type": "application/sdp",
        },
      });

      if (!sdpResponse.ok) {
        const errorText = await sdpResponse.text();
        console.error("SDP response error:", errorText);
        alert(`SDP response error: ${sdpResponse.status} ${errorText}`);
        return;
      }

      const sdpText = await sdpResponse.text();
      console.log("Received SDP answer");

      const answer = {
        type: "answer",
        sdp: sdpText,
      };
      await pc.setRemoteDescription(answer);
      console.log("Set remote description");

      peerConnection.current = pc;
      setIsSessionActive(true);
      console.log("Session initialized successfully");
    } catch (error) {
      console.error("Error starting session:", error);
      alert("Failed to start session. Check console for details.");
    }
  }

  // Function to send a client event
  function sendClientEvent(message) {
    if (!dataChannel || dataChannel.readyState !== "open") {
      console.error("Data channel not ready, state:", dataChannel?.readyState);
      return;
    }

    try {
      message.event_id = message.event_id || crypto.randomUUID();
      dataChannel.send(JSON.stringify(message));
      setEvents((prev) => [message, ...prev]);
    } catch (error) {
      console.error("Error sending message:", error, message);
    }
  }

  // Send a text message to the model
  function sendTextMessage(message) {
    const event = {
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: message,
          },
        ],
      },
    };

    sendClientEvent(event);
    sendClientEvent({ type: "response.create" });
  }

  // Stop current session, clean up peer connection and data channel
  function stopSession() {
    if (dataChannel) {
      try {
        dataChannel.close();
      } catch (e) {
        console.error("Error closing data channel:", e);
      }
    }

    if (peerConnection.current) {
      try {
        peerConnection.current.getSenders().forEach((sender) => {
          if (sender.track) {
            sender.track.stop();
          }
        });
        peerConnection.current.close();
      } catch (e) {
        console.error("Error closing peer connection:", e);
      }
    }

    if (audioElement.current) {
      try {
        audioElement.current.srcObject = null;
        if (audioElement.current.parentNode) {
          audioElement.current.parentNode.removeChild(audioElement.current);
        }
      } catch (e) {
        console.error("Error cleaning up audio element:", e);
      }
    }

    setIsSessionActive(false);
    setDataChannel(null);
    peerConnection.current = null;
    setMicrophoneStatus("waiting");
    console.log("Session stopped");
  }

  return (
    <>
      <nav className="absolute top-0 left-0 right-0 h-16 flex items-center">
        <div className="flex items-center gap-4 w-full m-4 pb-2 border-0 border-b border-solid border-gray-200">
          <img style={{ width: "50px" }} src={logo} />
          <h1>Jose - DevOps & AI Expert</h1>
          {microphoneStatus !== "waiting" && (
            <span className={`ml-4 px-2 py-1 rounded text-sm ${microphoneStatus === "granted"
              ? "bg-green-100 text-green-800"
              : "bg-red-100 text-red-800"
              }`}>
              Mic: {microphoneStatus}
            </span>
          )}
        </div>
      </nav>
      <main className="absolute top-16 left-0 right-0 bottom-0">
        <section className="absolute top-0 left-0 right-[380px] bottom-0 flex">
          <section className="absolute top-0 left-0 right-0 bottom-32 px-4 overflow-y-auto">
            <EventLog events={events} />
          </section>
          <section className="absolute h-32 left-0 right-0 bottom-0 p-4">
            <SessionControls
              startSession={startSession}
              stopSession={stopSession}
              sendClientEvent={sendClientEvent}
              sendTextMessage={sendTextMessage}
              events={events}
              isSessionActive={isSessionActive}
            />
          </section>
        </section>
        <section className="absolute top-0 w-[380px] right-0 bottom-0 p-4 pt-0 overflow-y-auto">
          <ToolPanel
            sendClientEvent={sendClientEvent}
            sendTextMessage={sendTextMessage}
            events={events}
            isSessionActive={isSessionActive}
          />
        </section>
      </main>
    </>
  );
}

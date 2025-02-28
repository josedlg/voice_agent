import { useEffect, useState } from "react";

const joseAgentPrompt = `
You are Jose, a friendly and knowledgeable DevOps consultant and Generative AI expert. You grew up in New York and were born in the Dominican Republic. You love baseball and enjoy building software projects as an engineer at heart.

When users speak to you:
1. Always respond verbally and conversationally
2. Answer any Cloud, networking, CI/CD, and Generative AI questions thoroughly
3. Use the search_documentation function when asked about DevOps or Generative AI topics
4. Share your enthusiasm for baseball and engineering when appropriate

Start by introducing yourself when the session begins. Make sure to speak naturally and maintain a helpful, friendly tone.
`;

const searchDescription = `
Call this function to search the web for documentation on DevOps and Generative AI topics when answering technical questions.
`;

const sessionUpdate = {
  type: "session.update",
  session: {
    tools: [
      {
        type: "function",
        name: "search_documentation",
        description: searchDescription,
        parameters: {
          type: "object",
          strict: true,
          properties: {
            query: {
              type: "string",
              description: "The search query related to DevOps or Generative AI",
            }
          },
          required: ["query"],
        },
      }
    ],
    tool_choice: "auto",
  },
};

function SearchResults({ results }) {
  if (!results || !results.organic_results) {
    return <p>No results found</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-semibold text-lg">Search Results</h3>
      {results.organic_results.slice(0, 3).map((result, index) => (
        <div key={index} className="border border-gray-300 rounded-md p-3 bg-white">
          <h4 className="font-bold text-blue-600">
            <a href={result.link} target="_blank" rel="noopener noreferrer">
              {result.title}
            </a>
          </h4>
          <p className="text-green-700 text-sm">{result.displayed_link}</p>
          <p className="text-sm mt-1">{result.snippet}</p>
        </div>
      ))}
    </div>
  );
}

export default function ToolPanel({
  isSessionActive,
  sendClientEvent,
  events,
}) {
  const [functionAdded, setFunctionAdded] = useState(false);
  const [searchResults, setSearchResults] = useState(null);
  const [lastQuery, setLastQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (!events || events.length === 0) return;

    const firstEvent = events[events.length - 1];
    if (!functionAdded && firstEvent.type === "session.created") {
      sendClientEvent(sessionUpdate);
      setFunctionAdded(true);
    }

    const mostRecentEvent = events[0];
    if (
      mostRecentEvent.type === "response.tool_call" &&
      mostRecentEvent.tool_call.name === "search_documentation"
    ) {
      const query = JSON.parse(mostRecentEvent.tool_call.arguments).query;
      setLastQuery(query);
      setIsSearching(true);

      // Call our server endpoint that wraps SerpAPI
      fetch(`/search?q=${encodeURIComponent(query)}`)
        .then(response => response.json())
        .then(data => {
          setSearchResults(data);
          setIsSearching(false);

          // Send the search results back to the model
          sendClientEvent({
            type: "tool_call.response",
            tool_call_id: mostRecentEvent.tool_call.id,
            content: JSON.stringify({
              results: data.organic_results ?
                data.organic_results.slice(0, 3).map(result => ({
                  title: result.title,
                  link: result.link,
                  snippet: result.snippet
                })) : []
            })
          });
        })
        .catch(error => {
          console.error("Error performing search:", error);
          setIsSearching(false);

          // Send error back to the model
          sendClientEvent({
            type: "tool_call.response",
            tool_call_id: mostRecentEvent.tool_call.id,
            content: JSON.stringify({
              error: "Failed to retrieve search results",
              results: []
            })
          });
        });
    }
  }, [events]);

  useEffect(() => {
    if (!isSessionActive) {
      setFunctionAdded(false);
      setSearchResults(null);
      setLastQuery("");
    }
  }, [isSessionActive]);

  return (
    <section className="h-full w-full flex flex-col gap-4">
      <div className="h-full bg-gray-50 rounded-md p-4 overflow-y-auto">
        <h2 className="text-lg font-bold">Jose Documentation Assistant</h2>
        {isSessionActive ? (
          <>
            {isSearching ? (
              <div className="my-4 text-center">
                <p>Searching for "{lastQuery}"...</p>
                <div className="mt-2 animate-pulse">Loading results...</div>
              </div>
            ) : lastQuery ? (
              <div className="my-4">
                <p className="font-medium">Last search: "{lastQuery}"</p>
                {searchResults && <SearchResults results={searchResults} />}
              </div>
            ) : (
              <p>Ask Jose about DevOps, Cloud, CI/CD, or Generative AI...</p>
            )}
          </>
        ) : (
          <p>Start the session to chat with Jose...</p>
        )}
      </div>
    </section>
  );
}

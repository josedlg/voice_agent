# AI Voice Agent 

This application is a minimal template that uses [express](https://expressjs.com/) to serve the React frontend contained in the [`/client`](./client) folder. The server is configured to use [vite](https://vitejs.dev/) to build the React frontend.

This application shows how to send and receive Realtime API events over the WebRTC data channel and configure client-side function calling. You can also view the JSON payloads for client and server events using the logging panel in the UI.
## Installation and usage

Before you begin, you'll need an OpenAI API key - [create one in the dashboard here](https://platform.openai.com/settings/api-keys). Create a `.env` file from the example file and set your API key in there:

Additionally if you want to use the search_documentation function, you'll need a SerpAPI key - [create one here](https://serpapi.com/dashboard).

```bash
cp .env.example .env
```

Running this application locally requires [Node.js](https://nodejs.org/) to be installed. Install dependencies for the application with:

```bash
npm install
```

Start the application server with:

```bash
npm run dev
```

This should start the console application on [http://localhost:3000](http://localhost:3000).


## Creating Custom Tools

You can extend the agent's capabilities by creating your own custom tools (functions). Here's how:

1. Create a new function in the `functions` directory:

```js
// functions/yourCustomFunction.js
export default async function yourCustomFunction(params) {
  // Your function implementation here
  return {
    result: "Your function result"
  };
}
```

2. Register your function in the tools configuration:

```js
// config/tools.js
import yourCustomFunction from '../functions/yourCustomFunction.js';

export const availableTools = [
  {
    type: "function",
    function: {
      name: "yourCustomFunction",
      description: "Description of what your function does",
      parameters: {
        type: "object",
        properties: {
          // Define parameters your function needs
          param1: {
            type: "string",
            description: "Description of parameter 1"
          }
        },
        required: ["param1"]
      }
    }
  },
  // other tools...
];
```

3. Update your client-side code to handle the new function.

## Customizing Agent Prompts

You can customize the agent's behavior by modifying its system prompt:

1. Edit the system prompt in the configuration:

```js
// config/prompts.js
export const systemPrompt = `
You are an AI assistant with the following capabilities:
- Ability to help users with [specific tasks]
- Access to tools including [list your tools]
- [Add any specific personality traits or behaviors]

When users ask for help, you should:
- [Add specific instructions for the agent]
- [Add any constraints or guidelines]
`;
```

2. Customize user context or additional instructions:

```js
// This can be added to your API call
const messages = [
  { role: "system", content: systemPrompt },
  // Optional additional context
  { 
    role: "system", 
    content: "Additional instructions or context for specific situations" 
  },
  // User messages follow
];
```

For more advanced customization, refer to the OpenAI documentation on [system instructions](https://platform.openai.com/docs/guides/prompt-engineering/system-instructions).

## License

MIT

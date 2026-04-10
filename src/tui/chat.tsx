import React, { useState, useEffect, useRef } from 'react';
import { render, Text, Box, useInput, useApp } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatProps {
  model: string;
  apiUrl: string;
}

const Chat: React.FC<ChatProps> = ({ model, apiUrl }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentResponse, setCurrentResponse] = useState('');
  const { exit } = useApp();

  useInput((input, key) => {
    if (input === 'q' && key.ctrl) {
      exit();
    }
  });

  const handleSend = async () => {
    if (!inputValue.trim() || isGenerating) return;

    const userMessage: Message = { role: 'user', content: inputValue.trim() };
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsGenerating(true);
    setCurrentResponse('');

    try {
      const response = await fetch(`${apiUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          model: model,
          stream: true,
          max_tokens: 512,
        }),
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n').filter(line => line.startsWith('data: '));

          for (const line of lines) {
            const data = line.replace('data: ', '');
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const token = parsed.choices?.[0]?.delta?.content || '';
              fullText += token;
              setCurrentResponse(fullText);
            } catch {}
          }
        }
      }

      setMessages(prev => [...prev, { role: 'assistant', content: fullText }]);
      setCurrentResponse('');
    } catch (error) {
      setCurrentResponse(`\n❌ Error: ${error.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Box flexDirection="column" width="100%" paddingX={2}>
      <Box marginBottom={1}>
        <Text bold color="cyan">🤖 Haven Chat</Text>
        <Text color="gray"> | Model: {model} | Ctrl+Q to exit</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        {messages.map((msg, i) => (
          <Box key={i} flexDirection="column" marginBottom={1}>
            {msg.role === 'user' ? (
              <Box>
                <Text bold color="green">You: </Text>
                <Text>{msg.content}</Text>
              </Box>
            ) : (
              <Box>
                <Text bold color="magenta">Haven: </Text>
                <Text wrap="wrap">{msg.content}</Text>
              </Box>
            )}
          </Box>
        ))}

        {isGenerating && (
          <Box>
            <Text bold color="magenta">Haven: </Text>
            <Text color="yellow"><Spinner type="dots" /></Text>
            <Text wrap="wrap"> {currentResponse}</Text>
          </Box>
        )}
      </Box>

      <Box>
        <Text bold color="green">{'>'} </Text>
        <TextInput
          value={inputValue}
          onChange={setInputValue}
          onSubmit={handleSend}
          placeholder="Type a message..."
        />
      </Box>
    </Box>
  );
};

export default Chat;

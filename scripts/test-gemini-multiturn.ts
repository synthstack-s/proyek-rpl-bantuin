import { GoogleGenerativeAI } from '@google/generative-ai';
import { getProviderRuntimeConfig } from '../src/lib/ai/repository';

async function test() {
  const config = await getProviderRuntimeConfig('gemini');
  if (!config) return;

  const genAI = new GoogleGenerativeAI(config.apiKey);
  const model = genAI.getGenerativeModel({
    model: config.selectedModel || 'gemini-2.5-flash',
    tools: [
      {
        functionDeclarations: [
          {
            name: 'searchDatabaseUsers',
            description: 'Mencari data pengguna.',
            parameters: {
              type: 'OBJECT' as any,
              properties: {
                query: { type: 'STRING' as any },
              },
              required: ['query'],
            },
          },
        ],
      },
    ],
  });

  const toolData = {
    success: true,
    data: [
      {
        id: 10,
        fullName: 'Salsa Nabil',
        phoneNumber: '62881022834828',
        email: 'sn9942136@gmail.com',
        role: 'customer',
      },
    ],
  };

  // Test with role: 'function'
  try {
    console.log('Testing with role: function...');
    const res1 = await model.generateContent({
      contents: [
        { role: 'user', parts: [{ text: 'siapa nama pengguna dengan nomor telepon 62881022834828' }] },
        {
          role: 'model',
          parts: [{ functionCall: { name: 'searchDatabaseUsers', args: { query: '62881022834828' } } }],
        },
        {
          role: 'function' as any,
          parts: [{ functionResponse: { name: 'searchDatabaseUsers', response: toolData } }],
        },
      ],
    });
    console.log('RES 1 (role: function):', res1.response.text());
  } catch (err: any) {
    console.error('ERROR 1:', err.message);
  }

  // Test with role: 'user'
  try {
    console.log('Testing with role: user...');
    const res2 = await model.generateContent({
      contents: [
        { role: 'user', parts: [{ text: 'siapa nama pengguna dengan nomor telepon 62881022834828' }] },
        {
          role: 'model',
          parts: [{ functionCall: { name: 'searchDatabaseUsers', args: { query: '62881022834828' } } }],
        },
        {
          role: 'user',
          parts: [{ functionResponse: { name: 'searchDatabaseUsers', response: toolData } }],
        },
      ],
    });
    console.log('RES 2 (role: user):', res2.response.text());
  } catch (err: any) {
    console.error('ERROR 2:', err.message);
  }
}

test().catch(console.error);

import 'dotenv/config';
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function testModel(modelName: string, withSearch: boolean) {
  try {
    const config = withSearch ? { tools: [{ googleSearch: {} }] } : undefined;
    const response = await ai.models.generateContent({
      model: modelName,
      contents: "Hello",
      config: config,
    });
    console.log(`SUCCESS [${modelName}] [Search: ${withSearch}]:`, response.text);
  } catch (err: any) {
    console.error(`ERROR [${modelName}] [Search: ${withSearch}]:`, err.status, err.message);
  }
}

async function main() {
  await testModel("gemini-1.5-flash", false);
  await testModel("gemini-2.0-flash", false);
  await testModel("gemini-3-flash-preview", false);
  
  await testModel("gemini-1.5-flash", true);
  await testModel("gemini-2.0-flash", true);
  await testModel("gemini-3-flash-preview", true);
}

main();

import { GoogleGenAI, Type } from "@google/genai";

const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY is not set in environment variables.");
  }
  return new GoogleGenAI({
    apiKey: apiKey || '',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
};

interface GameClues {
  citizenWord: string;
  liarWord: string;
  aiPrompt: string;
  decoys: string[];
}

export async function generateGameClues(category: string): Promise<GameClues> {
  const ai = getGeminiClient();
  
  const systemInstruction = `You are a creative party game show host designing a game called "AI Catch the Tail" (AI 꼬리잡기 / Liar Game Evolution in Korean).
When given a category, you must generate:
1. citizenWord: A concrete, specific, commonly known noun in Korean within the category (e.g. "사과" for "과일", "호랑이" for "동물", "스파이더맨" for "영화").
2. liarWord: A different, highly related noun in Korean in the same category that would confuse a liar and lead to hilarious misunderstandings (e.g. "배" or "복숭아" if citizen's is "사과", "사자" if "호랑이", "아이언맨" if "스파이더맨"). It must belong to the exact same category.
3. aiPrompt: A whimsical, creative, and highly specific question or mission prompt in Korean. This prompt must ask players to describe or act/explain their secret word in a witty, indirect, or metaphorical way. Example prompt style: "이 물건의 치명적인 매력을 다섯 글자로 주접떨어 주세요", "이 생물이 만약 사람으로 환생한다면 가장 먼저 할 것 같은 말은?", "이 것과 어울리는 기상천외한 가상의 직업을 지어주세요". Make the prompt fun, creative, and strictly in Korean!
4. decoys: An array of 2 other different nouns in Korean belonging to the exact same category, distinct from clean citizenWord and liarWord. These will be used as multiple choice options for the guessing phase.

Be funny, imaginative, and output only valid Korean for strings. Make sure citizenWord, liarWord, and decoys are completely different words, but very closely related (similar size, category, usage, or appearance).`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: `Category: ${category}`,
      config: {
        systemInstruction,
        temperature: 0.95,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            citizenWord: {
              type: Type.STRING,
              description: "The secret word for Citizens, a concrete, distinct Korean noun."
            },
            liarWord: {
              type: Type.STRING,
              description: "The secret word for the Liar, which must be closely related to citizenWord but distinct."
            },
            aiPrompt: {
              type: Type.STRING,
              description: "An engaging, creative question/challenge in Korean requiring players to describe their word indirectly."
            },
            decoys: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Two other distinct words in the exact same category."
            }
          },
          required: ["citizenWord", "liarWord", "aiPrompt", "decoys"]
        }
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error("No response from Gemini API");
    }

    const data = JSON.parse(text.trim()) as GameClues;
    console.log("Gemini generated clues:", data);
    return data;
  } catch (error) {
    console.error("Error generating game clues:", error);
    // Fallbacks in case of error or rate-limiting
    const fallbacks: Record<string, GameClues[]> = {
      '과일': [
        { citizenWord: "사과", liarWord: "배", aiPrompt: "이 과일의 첫 느낌을 다섯 글자로 찬양해 본다면?", decoys: ["복숭아", "바나나"] },
        { citizenWord: "바나나", liarWord: "파인애플", aiPrompt: "이 노란 매력을 무인도에 고립된 내 지인에게 비유해 주세요.", decoys: ["망고", "오렌지"] }
      ],
      '동물': [
        { citizenWord: "호랑이", liarWord: "사자", aiPrompt: "이 동물이 만약 직장 상사라면 부하 직원들에게 가장 자주 던질 잔소리는?", decoys: ["치타", "표범"] },
        { citizenWord: "고양이", liarWord: "강아지", aiPrompt: "이 생물이 인간 세계에서 커피숍을 열었을 때 출시할 기상천외한 메뉴 이름은?", decoys: ["토끼", "햄스터"] }
      ],
      '음식': [
        { citizenWord: "떡볶이", liarWord: "라면", aiPrompt: "이 음식을 일요일 오후 세 시에 혼자 티비를 보면서 한 숟가락 입에 넣었을 때 떠오르는 상상은?", decoys: ["김밥", "순대"] }
      ]
    };
    
    // Choose a fallback based on category or default
    const catFallbacks = fallbacks[category] || [
      { citizenWord: "우주비행사", liarWord: "비행기조종사", aiPrompt: "이 사람들이 출근길 외투 주머니에 절대 빠뜨리지 않는 가장 의외의 물건은?", decoys: ["소방관", "경찰관"] }
    ];
    
    const chosen = catFallbacks[Math.floor(Math.random() * catFallbacks.length)];
    return chosen;
  }
}

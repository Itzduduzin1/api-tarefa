import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const API = "https://testsunsa.discloud.app/api";

console.log("KEY:", process.env.GEMINI_KEY);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY);

// 🔥 extrator robusto de JSON
function extrairJSON(texto) {
  const inicio = texto.indexOf("{");
  const fim = texto.lastIndexOf("}");

  if (inicio === -1 || fim === -1) return null;

  try {
    return JSON.parse(texto.slice(inicio, fim + 1));
  } catch (e) {
    return null;
  }
}

app.post("/api/fazer-tarefa", async (req, res) => {
  const { id, token } = req.body;

  try {
    // 1. buscar tarefa
    const tarefaRes = await fetch(`${API}/tarefas/${id}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const tarefa = await tarefaRes.json();

    if (!tarefa || tarefa.erro) {
      return res.status(400).json({ erro: "Tarefa inválida" });
    }

    console.log("Tarefa:", tarefa.titulo);

    // 2. modelo Gemini
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
    });

    // 3. prompt estruturado
    const prompt = `
Você é um aluno respondendo uma prova.

Responda SOMENTE em JSON válido.

Formato obrigatório:
{
  "q1": "resposta",
  "q2": "resposta"
}

Regras:
- múltipla escolha: responda apenas o índice (0,1,2...)
- dissertativa: responda curto (3 a 6 linhas)
- NÃO escreva texto fora do JSON
- NÃO use markdown

QUESTÕES:
${JSON.stringify(tarefa.questoes, null, 2)}
`;

    const result = await model.generateContent(prompt);
    const texto = await result.response.text();

    console.log("RAW IA:", texto);

    // 4. parse seguro
    const respostas = extrairJSON(texto);

    if (!respostas) {
      return res.status(500).json({
        erro: "IA não retornou JSON válido",
        raw: texto,
      });
    }

    console.log("RESPOSTAS IA:", respostas);

    // 5. enviar entrega correta
    const entregaRes = await fetch(`${API}/tarefas/${id}/entregar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        respostas,
      }),
    });

    const entrega = await entregaRes.json();

    res.json({
      ok: true,
      tarefa: tarefa.titulo,
      respostas,
      entrega,
    });

  } catch (err) {
    console.error("ERRO:", err);

    res.status(500).json({
      erro: "Falha geral",
      detalhe: err.message,
    });
  }
});

app.listen(3001, () => {
  console.log("IA rodando na porta 3001");
});

import express from "express";
import axios from "axios";
import "dotenv/config";

const app = express();
app.use(express.json());

/* =========================
   VERIFICACIÓN WEBHOOK
   ========================= */
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

/* =========================
   RECEPCIÓN DE MENSAJES
   ========================= */
app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];

    if (!message || !message.text) {
      return res.sendStatus(200);
    }

    const from = message.from;
    const text = message.text.body;

    const systemPrompt = `
Eres el asistente oficial de la Fundación Mezquita de Granada.
Respondes con tono respetuoso, claro y sobrio.
Atiendes solo consultas institucionales, horarios, visitas y actividades.
Si la consulta requiere atención humana, indícalo educadamente.
    `;

    const ai = await axios.post(
      "https://api.openai.com/v1/responses",
      {
        model: process.env.OPENAI_MODEL,
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const reply =
      ai.data?.output_text ||
      "Gracias por su mensaje. Para esta consulta, le derivamos a una persona del equipo.";

    await axios.post(
      `https://graph.facebook.com/v20.0/${process.env.PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: from,
        text: { body: reply }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );

    res.sendStatus(200);
  } catch (err) {
    console.error("ERROR:", err?.response?.data || err.message);
    res.sendStatus(200);
  }
});

/* =========================
   ARRANQUE
   ========================= */
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log("FMG WhatsApp bot activo en puerto", PORT);
});


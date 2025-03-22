require("dotenv").config();

const express = require("express");
const multer = require("multer");
const fs = require("fs");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const config = require("./public/js/config");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const app = express();

const logger = (req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
};

app.use(logger);

const upload = multer({ dest: config.uploadDir });

app.use(express.static("public"));
const path = require("path");

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.use(express.urlencoded({ extended: true }));

app.post("/analyze", upload.single("image"), async (req, res) => {
  try {
    const { promptText = "", adStyle = "exaggerated" } = req.body;

    if (
      !["exaggerated", "desperate", "luxury", "honest", "classic"].includes(
        adStyle
      )
    ) {
      return res.status(400).json({ error: "Invalid adStyle" });
    }

    const imageBuffer = await fs.promises.readFile(req.file.path);
    const base64Image = imageBuffer.toString("base64");

    const model = genAI.getGenerativeModel({ model: config.modelName });

    const stylePrompts = require("./public/js/prompts");

    const systemPrompt = `
Ai primit imaginea unei mașini. Identifică principalele caracteristici vizuale și generează un anunț de vânzare în stilul cerut.

STIL DE ANUNȚ: ${adStyle.toUpperCase()}
${stylePrompts[adStyle]}

${promptText ? `Sugestii adiționale de inclus: ${promptText}` : ""}

Dacă imaginea NU conține o mașină, răspunde cu: 'Vere asta nu-i mașină, ce facem aici?'
`;

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: "image/jpeg",
          data: base64Image,
        },
      },
      systemPrompt,
    ]);

    const response = await result.response;
    const text = response.text();

    res.json({ description: text });

    await fs.promises.unlink(req.file.path);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to analyze image." });
  }
});

app.post("/repair", upload.single("image"), async (req, res) => {
  try {
    const imageBuffer = fs.readFileSync(req.file.path);
    const base64Image = imageBuffer.toString("base64");

    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash-exp-image-generation",
      generationConfig: {
        responseModalities: ["Text", "Image"],
      },
    });

    const contents = [
      {
        text: "Păstrează imaginea acestei mașini cât mai similară cu originalul în ceea ce privește modelul, culoarea și unghiul, dar repară-o complet și adu-o în stare perfectă. Vreau să văd exact aceeași mașină, dar fără rugină, fără zgârieturi, cu toate piesele lipsă sau deteriorate înlocuite, vopseaua impecabilă și un aspect general perfect. Asigură-te că se recunoaște că este aceeași mașină, doar într-o stare mult mai bună.",
      },
      {
        inlineData: {
          mimeType: "image/jpeg",
          data: base64Image,
        },
      },
    ];

    const result = await model.generateContent(contents);
    const parts = result.response.candidates?.[0]?.content?.parts;

    const imagePart = parts?.find((p) => p.inlineData && p.inlineData.data);

    if (!imagePart) throw new Error("No image data returned.");

    const repairedImageBase64 = imagePart.inlineData.data;

    res.json({ repairedImage: repairedImageBase64 });
    fs.unlinkSync(req.file.path);
  } catch (err) {
    console.error("Repair image failed:", err);
    res.status(500).json({ error: "Failed to repair image." });
  }
});

app.listen(3000, () =>
  console.log("🚀 Server running at http://localhost:3000")
);

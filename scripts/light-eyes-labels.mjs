// Writes src/lib/ai/light-eyes-labels.json: what each kid-drawing subject
// "looks like" to MobileCLIP S0 (its text embedding), so iPhones and iPads can
// guess a drawing with only the small image half of the model (12 MB), never
// downloading or running the text half. Run once after changing the labels:
//   node scripts/light-eyes-labels.mjs
// Each label is the average of a few phrasings, normalised, stored as 8-bit
// numbers with one scale per label (base64), about 40 KB in all.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { AutoTokenizer, CLIPTextModelWithProjection } from "@huggingface/transformers";

const MODEL = "Xenova/mobileclip_s0";

/** What the light eyes can name, as "Is that …?" asks it. */
export const LABELS = [
  // Animals
  "a cat", "a dog", "a bird", "a fish", "a horse", "a rabbit", "a bear", "an elephant", "a lion", "a tiger",
  "a monkey", "a giraffe", "a pig", "a cow", "a duck", "a chicken", "an owl", "a penguin", "a turtle", "a frog",
  "a snake", "a mouse", "a butterfly", "a bee", "a ladybug", "a spider", "an octopus", "a whale", "a shark",
  "a dinosaur", "a dragon", "a unicorn",
  // People and make-believe
  "a girl", "a boy", "a princess", "a superhero", "a robot", "a monster", "an alien", "a ghost", "a mermaid",
  "a fairy", "a snowman",
  // Nature
  "a flower", "a tree", "the sun", "a star", "the moon", "a rainbow", "a cloud", "a heart", "a mountain",
  // Things
  "a house", "a castle", "a car", "a truck", "a bus", "a train", "an airplane", "a rocket", "a boat",
  "a bicycle", "a ball", "a cake", "an ice cream", "an apple", "a balloon", "a kite", "a crown",
];

const PHRASINGS = [
  (x) => `a child's drawing of ${x}`,
  (x) => `a crayon drawing of ${x}`,
  (x) => `a simple doodle of ${x}`,
  (x) => `a kid's colourful picture of ${x}`,
];

const tokenizer = await AutoTokenizer.from_pretrained(MODEL);
const model = await CLIPTextModelWithProjection.from_pretrained(MODEL, { dtype: "fp32" });

const unit = (v) => {
  const length = Math.hypot(...v);
  return v.map((x) => x / length);
};

const labels = [];
for (const label of LABELS) {
  const texts = PHRASINGS.map((phrase) => phrase(label));
  const inputs = tokenizer(texts, { padding: "max_length", truncation: true });
  const { text_embeds } = await model(inputs);
  const rows = text_embeds.tolist().map(unit);
  const mean = unit(rows[0].map((_, i) => rows.reduce((sum, row) => sum + row[i], 0) / rows.length));
  const scale = Math.max(...mean.map(Math.abs)) / 127;
  const bytes = Int8Array.from(mean, (x) => Math.round(x / scale));
  labels.push({ label, scale, vector: Buffer.from(bytes.buffer).toString("base64") });
}

const out = join(process.cwd(), "src/lib/ai/light-eyes-labels.json");
writeFileSync(out, `${JSON.stringify({ model: MODEL, labels }, null, 1)}\n`);
console.log(`Wrote ${labels.length} labels to ${out}`);

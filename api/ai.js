import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { mode, contact_id, message } = req.body;

  try {
    // Load contact info
    const { data: contact } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', contact_id)
      .single();

    // Load message history
    const { data: messages } = await supabase
      .from('messages')
      .select('*')
      .eq('contact_id', contact_id)
      .order('created_at', { ascending: true });

    const historyText = messages && messages.length > 0
      ? messages.map(m => `[${m.direction === 'eingehend' ? 'Sie' : 'Ich'}]: ${m.content}`).join('\n')
      : '(noch keine Nachrichten gespeichert)';

    const contactInfo = contact ? `
TikTok: @${contact.tiktok_username}
Name: ${contact.display_name || 'unbekannt'}
Alter (ca.): ${contact.age_estimate || 'unbekannt'}
Status: ${contact.status}
Priorität: ${contact.priority}
Problem-Kategorie: ${contact.problem_category || 'nicht angegeben'}
Zusammenfassung: ${contact.problem_summary || 'noch nicht erfasst'}
Notizen: ${contact.notes || '–'}
    `.trim() : 'Keine Kontaktdaten verfügbar.';

    let prompt = '';

    if (mode === 'summary') {
      prompt = `Du bist ein einfühlsamer Assistent, der einem jungen Menschen hilft, den Überblick über seine Gespräche mit anderen Jugendlichen zu behalten, denen es nicht gut geht.

Hier sind die Infos zu dieser Person:
${contactInfo}

Gesprächsverlauf:
${historyText}

Erstelle eine kurze, klare Zusammenfassung (3-5 Sätze) für diese Person. Was ist ihr Kernproblem? Wie entwickelt sich die Situation? Was braucht besondere Aufmerksamkeit? Schreib auf Deutsch, warm und klar.`;
    }

    if (mode === 'reply') {
      prompt = `Du bist ein einfühlsamer Assistent, der einem jungen Menschen hilft, seinen Freunden auf TikTok zu antworten, denen es nicht gut geht.

Infos zur Person:
${contactInfo}

Bisheriger Gesprächsverlauf:
${historyText}

Neue Nachricht die beantwortet werden soll:
"${message}"

Schreib 3 verschiedene Antwort-Vorschläge auf Deutsch. Die Antworten sollen:
- Authentisch und jugendlich klingen (kein formales Deutsch)
- Empathisch und unterstützend sein
- Nicht zu lang sein (max 3-4 Sätze pro Vorschlag)
- Nicht aufgesetzt oder therapeutisch klingen

Formatiere die Antworten als JSON Array:
[{"label": "Einfühlsam", "text": "..."}, {"label": "Praktisch", "text": "..."}, {"label": "Aufmunternd", "text": "..."}]

Antworte NUR mit dem JSON, kein Text davor oder danach.`;
    }

    if (mode === 'categorize') {
      prompt = `Analysiere diese Beschreibung eines Problems und gib eine kurze Kategorisierung zurück.

Beschreibung: "${message}"

Antworte NUR mit JSON in diesem Format (keine weiteren Texte):
{
  "category": "eine von: Einsamkeit, Depressionen/Angst, Familiäre Probleme, Schulstress, Mobbing, Selbstverletzung, Beziehungsprobleme, Identität, Sonstiges",
  "priority": "eine von: hoch, mittel, niedrig",
  "summary": "eine Zusammenfassung in 1-2 Sätzen"
}`;
    }

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }]
    });

    const text = response.content[0].text;

    if (mode === 'reply' || mode === 'categorize') {
      try {
        const clean = text.replace(/```json|```/g, '').trim();
        return res.status(200).json({ result: JSON.parse(clean) });
      } catch {
        return res.status(200).json({ result: text });
      }
    }

    return res.status(200).json({ result: text });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

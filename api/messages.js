import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const { contact_id } = req.query;
      if (!contact_id) return res.status(400).json({ error: 'contact_id required' });
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('contact_id', contact_id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const { data, error } = await supabase
        .from('messages')
        .insert([req.body])
        .select()
        .single();
      if (error) throw error;

      // Update last_contact on the contact
      await supabase
        .from('contacts')
        .update({ last_contact: new Date().toISOString() })
        .eq('id', req.body.contact_id);

      return res.status(201).json(data);
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      const { error } = await supabase.from('messages').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

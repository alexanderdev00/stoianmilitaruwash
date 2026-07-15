import { kv } from '@vercel/kv';

function parseDateTime(dateStr, timeStr) {
  const [year, month, day] = dateStr.split('-');
  const [hours, minutes] = timeStr.split(':');
  return new Date(year, month - 1, day, hours, minutes);
}

function checkOverlap(newBooking, existingBookings) {
  if (newBooking.status === 'Anulat' || newBooking.status === 'Finalizat' || newBooking.status === 'Liber') return false;
  
  const newStart = parseDateTime(newBooking.date, newBooking.startTime).getTime();
  let newEnd = parseDateTime(newBooking.date, newBooking.endTime).getTime();
  if (newEnd <= newStart) newEnd += 24 * 60 * 60 * 1000;

  for (const b of existingBookings) {
    if (b.status === 'Anulat' || b.status === 'Finalizat' || b.status === 'Liber') continue;
    if (b.id === newBooking.id) continue;
    
    const bStart = parseDateTime(b.date, b.startTime).getTime();
    let bEnd = parseDateTime(b.date, b.endTime).getTime();
    if (bEnd <= bStart) bEnd += 24 * 60 * 60 * 1000;

    if (newStart < bEnd && newEnd > bStart) {
      return true;
    }
  }
  return false;
}

export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      const payload = req.body;
      const existingData = await kv.get('spalatorie_state');

      // STRICT Optimistic Concurrency Control (OCC)
      if (existingData && existingData._lastModified) {
        if (!payload._baseVersion || payload._baseVersion < existingData._lastModified) {
          console.error(`OCC FAILED: Server version ${existingData._lastModified}, Client version ${payload._baseVersion}`);
          return res.status(409).json({ 
            status: 'error', 
            code: 'OUT_OF_SYNC', 
            message: 'Clientul nu este sincronizat. Datele au fost modificate între timp de alt utilizator.' 
          });
        }
      }

      // Assign a new version timestamp
      payload._lastModified = Date.now();
      
      // Safety check just in case (to prevent accidental empty DB override if forceInit is not used)
      if (existingData && existingData.equipments && payload.equipments) {
        const exCount = existingData.equipments.reduce((sum, eq) => sum + (eq.bookings || []).filter(b => b.status === 'Programat').length, 0);
        const inCount = payload.equipments.reduce((sum, eq) => sum + (eq.bookings || []).filter(b => b.status === 'Programat').length, 0);
        if (exCount > 0 && inCount === 0 && !payload._forceInit && payload._baseVersion !== existingData._lastModified) {
          return res.status(409).json({ status: 'error', code: 'WIPE_PROTECTION', message: 'Salvare refuzată (prevenire golire).' });
        }
      }

      // Enforce limits to prevent Vercel bandwidth exhaustion
      if (payload.history && Array.isArray(payload.history)) {
        payload.history = payload.history.slice(0, 100);
      }
      if (payload.chatMessages && Array.isArray(payload.chatMessages)) {
        payload.chatMessages = payload.chatMessages.slice(0, 20);
      }

      // Remove the baseVersion field before saving
      delete payload._baseVersion;

      // Save the exact payload received from the (up-to-date) client
      await kv.set('spalatorie_state', payload);
      res.status(200).json({ status: 'success', engine: 'Vercel KV', _lastModified: payload._lastModified });
    } catch (error) {
      console.error(error);
      res.status(500).json({ status: 'error', message: 'Failed to save data' });
    }
  } else {
    res.status(405).json({ status: 'error', message: 'Method Not Allowed' });
  }
}

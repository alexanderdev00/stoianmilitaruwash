import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      const payload = req.body;
      
      const existingData = await kv.get('spalatorie_state');

      if (existingData) {
        // --- Merge Equipments ---
        if (existingData.equipments && payload.equipments) {
          const mergedEquipments = [];
          for (const inEq of payload.equipments) {
            const exEq = existingData.equipments.find(e => e.id === inEq.id);
            if (!exEq) {
              mergedEquipments.push(inEq);
              continue;
            }
            if (exEq.isBroken && !inEq.isBroken) inEq.isBroken = true;

            const exBookingsById = {};
            for (const b of exEq.bookings) exBookingsById[b.id] = b;

            const mergedBookings = [];
            const bookingIds = new Set();

            for (const inB of inEq.bookings) {
              if (exBookingsById[inB.id]) {
                const exB = exBookingsById[inB.id];
                if (exB.status === 'Anulat' || exB.status === 'Finalizat') {
                  mergedBookings.push(exB);
                  bookingIds.add(exB.id);
                  continue;
                }
                if (exB.announced) inB.announced = true;
              }
              mergedBookings.push(inB);
              bookingIds.add(inB.id);
            }

            for (const exB of exEq.bookings) {
              if (!bookingIds.has(exB.id)) mergedBookings.push(exB);
            }

            inEq.bookings = mergedBookings;
            mergedEquipments.push(inEq);
          }
          payload.equipments = mergedEquipments;
        }

        // --- Merge History ---
        if (existingData.history && payload.history) {
          const historyMap = new Map();
          // Add older existing history first
          for (const h of existingData.history) historyMap.set(h.id + (h.finalStatus || ''), h);
          // Overwrite/add incoming history
          for (const h of payload.history) historyMap.set(h.id + (h.finalStatus || ''), h);
          
          payload.history = Array.from(historyMap.values())
            .sort((a, b) => {
              // rough sort by parsing the string date if possible, but keep original order ideally
              return 0; // The unshift in frontend keeps it sorted, but map values might lose order. 
            });
            
          // To keep it strictly chronological, we should reconstruct properly.
          // Since it's a log, we can just combine and deduplicate.
          const mergedHistory = [];
          const seenHist = new Set();
          
          // Incoming payload is usually the most recent, so we iterate it first
          for (const h of payload.history) {
            const key = h.id + (h.finalStatus || '');
            if (!seenHist.has(key)) {
              mergedHistory.push(h);
              seenHist.add(key);
            }
          }
          for (const h of existingData.history) {
            const key = h.id + (h.finalStatus || '');
            if (!seenHist.has(key)) {
              mergedHistory.push(h);
              seenHist.add(key);
            }
          }
          payload.history = mergedHistory.slice(0, 200); // limit
        }

        // --- Merge Users ---
        if (existingData.users && payload.users) {
          const mergedUsersMap = new Map();
          for (const u of existingData.users) mergedUsersMap.set(u.name.toLowerCase(), u);
          for (const u of payload.users) {
            const exU = mergedUsersMap.get(u.name.toLowerCase());
            if (exU) {
              // Merge strikes
              if (exU.strikes > u.strikes) u.strikes = exU.strikes;
              if (exU.strikeHistory && (!u.strikeHistory || exU.strikeHistory.length > u.strikeHistory.length)) {
                u.strikeHistory = exU.strikeHistory;
              }
              // Merge roles
              if (exU.role === 'admin' || exU.role === 'sef' || exU.role === 'developer') u.role = exU.role;
            }
            mergedUsersMap.set(u.name.toLowerCase(), u);
          }
          payload.users = Array.from(mergedUsersMap.values());
        }

        // --- Merge Chat ---
        if (existingData.chatMessages && payload.chatMessages) {
          const chatMap = new Map();
          for (const c of existingData.chatMessages) chatMap.set(c.id || c.timestamp, c);
          for (const c of payload.chatMessages) chatMap.set(c.id || c.timestamp, c);
          payload.chatMessages = Array.from(chatMap.values()).sort((a,b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 50);
        }
      }

      await kv.set('spalatorie_state', payload);
      res.status(200).json({ status: 'success', engine: 'Vercel KV', mergeApplied: true, payload: payload });
    } catch (error) {
      console.error(error);
      res.status(500).json({ status: 'error', message: 'Failed to save data' });
    }
  } else {
    res.status(405).json({ status: 'error', message: 'Method Not Allowed' });
  }
}

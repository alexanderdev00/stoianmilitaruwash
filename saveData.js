import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      const payload = req.body;
      
      // 1. Fetch current server state
      const existingData = await kv.get('spalatorie_state');

      // 2. Perform intelligent merge
      if (existingData && existingData.equipments && payload.equipments) {
        const mergedEquipments = [];
        
        for (const inEq of payload.equipments) {
          const exEq = existingData.equipments.find(e => e.id === inEq.id);
          if (!exEq) {
            mergedEquipments.push(inEq);
            continue;
          }

          // Merge isBroken property
          if (exEq.isBroken && !inEq.isBroken) {
            inEq.isBroken = true;
          }

          const exBookingsById = {};
          for (const b of exEq.bookings) {
            exBookingsById[b.id] = b;
          }

          const mergedBookings = [];
          const bookingIds = new Set();

          for (const inB of inEq.bookings) {
            if (exBookingsById[inB.id]) {
              const exB = exBookingsById[inB.id];
              // Server wins if status is terminal
              if (exB.status === 'Anulat' || exB.status === 'Finalizat') {
                mergedBookings.push(exB);
                bookingIds.add(exB.id);
                continue;
              }
              // Preserve announcement status
              if (exB.announced) {
                inB.announced = true;
              }
            }
            mergedBookings.push(inB);
            bookingIds.add(inB.id);
          }

          for (const exB of exEq.bookings) {
            if (!bookingIds.has(exB.id)) {
              mergedBookings.push(exB);
            }
          }

          inEq.bookings = mergedBookings;
          mergedEquipments.push(inEq);
        }
        
        payload.equipments = mergedEquipments;
      }

      // 3. Save merged state back to KV
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

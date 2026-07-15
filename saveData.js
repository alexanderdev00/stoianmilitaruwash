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

      // 1. Anti-Wipe Protection
      // If DB has data but incoming payload has FEWER bookings across all machines,
      // the client is out-of-date and we should merge, not overwrite.
      // We only block if DB is non-empty but the payload tries to replace it with empty equipment arrays.
      if (existingData && existingData.equipments && payload.equipments) {
        const existingBookingCount = existingData.equipments.reduce((sum, eq) => sum + (eq.bookings || []).filter(b => b.status === 'Programat').length, 0);
        const incomingBookingCount = payload.equipments.reduce((sum, eq) => sum + (eq.bookings || []).filter(b => b.status === 'Programat').length, 0);
        
        // If server has active bookings but incoming claims 0, it's a stale client trying to wipe
        if (existingBookingCount > 0 && incomingBookingCount === 0 && !payload._forceInit) {
          console.error(`ANTI-WIPE: Server has ${existingBookingCount} active bookings, client sent 0. Refusing wipe.`);
          return res.status(409).json({ status: 'error', code: 'WIPE_PROTECTION', message: 'Client out of date. Please refresh.' });
        }
      }

      const finalPayload = { ...payload };

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
            const now = new Date().getTime();
            const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

            const existingActive = [];
            for (const exB of exEq.bookings) {
              if (exB.status !== 'Anulat' && exB.status !== 'Finalizat') {
                 existingActive.push(exB);
              }
            }

            for (const inB of inEq.bookings) {
              if (exBookingsById[inB.id]) {
                const exB = exBookingsById[inB.id];
                if (exB.status === 'Anulat' || exB.status === 'Finalizat') {
                  // Only keep if it's less than 7 days old
                  let exBTime = now;
                  try {
                    const [year, month, day] = exB.date.split('-');
                    const [hours, minutes] = exB.startTime.split(':');
                    exBTime = new Date(year, month - 1, day, hours, minutes).getTime();
                  } catch(e){}
                  
                  if (now - exBTime < SEVEN_DAYS) {
                    mergedBookings.push(exB);
                    bookingIds.add(exB.id);
                  }
                  continue;
                }
                if (exB.announced) inB.announced = true;
                
                mergedBookings.push(inB);
                bookingIds.add(inB.id);
              } else {
                // This is a NEW booking from the client
                // 2. Server-side overlap prevention
                if (checkOverlap(inB, existingActive)) {
                   console.error(`OVERLAP DETECTED on server for eq ${inEq.id}, booking ${inB.id}`);
                   return res.status(409).json({ status: 'error', code: 'OVERLAP', message: 'Programarea se suprapune cu alta. A fost refuzată.' });
                }
                mergedBookings.push(inB);
                bookingIds.add(inB.id);
                existingActive.push(inB);
              }
            }

            for (const exB of exEq.bookings) {
              if (!bookingIds.has(exB.id)) {
                 mergedBookings.push(exB);
                 bookingIds.add(exB.id);
              }
            }

            inEq.bookings = mergedBookings;
            mergedEquipments.push(inEq);
          }
          finalPayload.equipments = mergedEquipments;
        }

        // --- Merge History ---
        if (existingData.history && payload.history) {
          const historyMap = new Map();
          for (const h of existingData.history) historyMap.set(h.id + (h.finalStatus || ''), h);
          for (const h of payload.history) historyMap.set(h.id + (h.finalStatus || ''), h);
          
          const mergedHistory = [];
          const seenHist = new Set();
          
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
          
          mergedHistory.sort((a, b) => {
            const dateA = a.date ? new Date(a.date.split(', ')[0].split('.').reverse().join('-') + 'T' + a.date.split(', ')[1]).getTime() : 0;
            const dateB = b.date ? new Date(b.date.split(', ')[0].split('.').reverse().join('-') + 'T' + b.date.split(', ')[1]).getTime() : 0;
            return dateB - dateA;
          });
          
          finalPayload.history = mergedHistory.slice(0, 3000); // 3000 items limit
        }

        // --- Merge Users ---
        if (existingData.users && payload.users) {
          const mergedUsersMap = new Map();
          for (const u of existingData.users) mergedUsersMap.set(u.name.toLowerCase(), u);
          for (const u of payload.users) {
            const exU = mergedUsersMap.get(u.name.toLowerCase());
            if (exU) {
              if (exU.strikes > u.strikes) u.strikes = exU.strikes;
              if (exU.strikeHistory && (!u.strikeHistory || exU.strikeHistory.length > u.strikeHistory.length)) {
                u.strikeHistory = exU.strikeHistory;
              }
              if (exU.role === 'admin' || exU.role === 'sef' || exU.role === 'developer') u.role = exU.role;
            }
            mergedUsersMap.set(u.name.toLowerCase(), u);
          }
          finalPayload.users = Array.from(mergedUsersMap.values());
        }

        // --- Merge Chat ---
        if (existingData.chatMessages && payload.chatMessages) {
          const chatMap = new Map();
          for (const c of existingData.chatMessages) chatMap.set(c.id || c.timestamp, c);
          for (const c of payload.chatMessages) chatMap.set(c.id || c.timestamp, c);
          finalPayload.chatMessages = Array.from(chatMap.values()).sort((a,b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 50);
        }
      }

      await kv.set('spalatorie_state', finalPayload);
      res.status(200).json({ status: 'success', engine: 'Vercel KV', mergeApplied: true, payload: finalPayload });
    } catch (error) {
      console.error(error);
      res.status(500).json({ status: 'error', message: 'Failed to save data' });
    }
  } else {
    res.status(405).json({ status: 'error', message: 'Method Not Allowed' });
  }
}

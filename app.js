class SpalatorieApp {
  constructor() {
    this.equipments = [
      { id: 'washer-1', name: 'Mașină Ușă', type: 'washer', status: 'Liber', bookings: [] },
      { id: 'washer-2', name: 'Mașină Mijloc', type: 'washer', status: 'Liber', bookings: [] },
      { id: 'washer-3', name: 'Mașină Geam', type: 'washer', status: 'Liber', bookings: [] },
      { id: 'dryer-1', name: 'Uscător Ușă', type: 'dryer', status: 'Indisponibil momentan', bookings: [] },
      { id: 'dryer-2', name: 'Uscător Geam', type: 'dryer', status: 'Indisponibil momentan', bookings: [] }
    ];
    this.history = [];
    this.users = [];
    this.chatMessages = [];
    this.announcement = null;
    this.currentActionMachine = null;
    this.isOnline = false;
    this.loggedInUser = null;
    this.isAdmin = false;
    this.currentLang = 'ro';
    this.isLightMode = false;
    
    try {
      this.isAdmin = sessionStorage.getItem('spalatorie_admin') === 'true';
      this.currentLang = localStorage.getItem('spalatorie_lang') || 'ro';
      this.isLightMode = localStorage.getItem('spalatorie_theme') === 'light';
    } catch(e) {
      console.warn("Storage access blocked by browser:", e);
    }

    this.init();
  }

  async init() {
    try {
      await this.loadData();
    this.unlockAudio();
    this.setupNavigation();
    this.setupBookingForm();
    this.setupCancelForm();
    this.setupModal();
    this.renderDashboard();
    this.generateWeekTabs();
    this.renderHistory();
    this.renderLeaderboard();
    
    // Theme & Lang init
    if (this.isLightMode) document.body.classList.add('light-theme');
    this.applyTranslations();
    this.setupThemeAndLang();
    this.setupAdminPanel();
    this.setupReportBroken();
    
    // V4 Features
    this.setupAuth();
    this.setupChat();
    this.checkAuth();
    
    // Hide loading screen with smooth transition
    setTimeout(() => {
      const ls = document.getElementById('loading-screen');
      if (ls) ls.classList.add('hidden');
    }, 800);

    // Auto-refresh from server every 60 seconds (Optimized for battery/CPU and Vercel quota)
    setInterval(async () => {
      const dataChanged = await this.loadData();
      if (dataChanged) {
        this.renderDashboard();
        this.renderChat();
        if (this.currentWeeklyDate) this.renderWeeklySchedule(this.currentWeeklyDate);
      }
    }, 60000);
    
    // Real-time timers tick
    setInterval(() => this.tickTimers(), 1000);

    // Check for upcoming bookings to announce (every 10 seconds)
    setInterval(() => this.checkUpcomingAnnouncements(), 10000);

    // V5 Features: Profile & Notifications
      this.setupProfile();
      setInterval(() => this.checkPushNotifications(), 60000); // Check every minute
    } catch (err) {
      alert("EROARE INIT: " + err.message + "\n" + err.stack);
      console.error("Init Error:", err);
      setTimeout(() => {
        const ls = document.getElementById('loading-screen');
        if (ls) ls.classList.add('hidden');
      }, 500);
    }
  }

  parseDateTime(dateStr, timeStr) {
    if (!dateStr || !timeStr) return new Date();
    const [year, month, day] = dateStr.split('-');
    const [hour, minute] = timeStr.split(':');
    return new Date(year, month - 1, day, hour, minute);
  }

  getLocalDateStr(d) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // ===== CONNECTION INDICATOR =====
  updateConnectionStatus(online) {
    this.isOnline = online;
    const dot = document.getElementById('connection-dot');
    const text = document.getElementById('connection-text');
    if (!dot || !text) return;
    
    if (online) {
      dot.className = 'connection-dot online';
      text.textContent = 'Sincronizat';
    } else {
      dot.className = 'connection-dot offline';
      text.textContent = 'Mod Offline';
    }
  }

  // ===== TOAST NOTIFICATIONS =====
  showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const icon = type === 'error' ? 'close-circle-outline' : 'checkmark-circle-outline';
    toast.innerHTML = `<ion-icon name="${icon}" style="font-size:1.5rem;"></ion-icon> <span>${message}</span>`;
    
    container.appendChild(toast);
    
    setTimeout(() => {
      toast.classList.add('fade-out');
      toast.addEventListener('animationend', () => toast.remove());
    }, 3500);
  }

  // ===== SUCCESS ANIMATION =====
  showSuccessAnimation(text = 'Programare confirmată!') {
    const overlay = document.createElement('div');
    overlay.className = 'success-overlay';
    overlay.innerHTML = `
      <div class="success-checkmark">
        <ion-icon name="checkmark-outline"></ion-icon>
      </div>
      <p>${text}</p>
    `;
    document.body.appendChild(overlay);
    this.playNotificationSound();
    
    setTimeout(() => {
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity 0.4s ease';
      setTimeout(() => overlay.remove(), 400);
    }, 1500);
  }

  // ===== AUDIO =====
  unlockAudio() {
    const unlock = () => {
      this.playNotificationSound(true); // silent unlock
      document.removeEventListener('click', unlock);
      document.removeEventListener('touchstart', unlock);
    };
    document.addEventListener('click', unlock);
    document.addEventListener('touchstart', unlock);
  }

  playNotificationSound(silent = false) {
    // Do Not Disturb mode between 22:00 and 08:00
    const hour = new Date().getHours();
    if (!silent && (hour >= 22 || hour < 8)) return;

    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      if (!this.audioCtx) this.audioCtx = new AudioContext();
      
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      if (silent) {
        const osc = this.audioCtx.createOscillator();
        osc.connect(this.audioCtx.destination);
        osc.start();
        osc.stop(this.audioCtx.currentTime + 0.001);
        return;
      }

      const playTone = (freq, time, dur) => {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime + time);
        
        gain.gain.setValueAtTime(0.5, this.audioCtx.currentTime + time);
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + time + dur);
        
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        
        osc.start(this.audioCtx.currentTime + time);
        osc.stop(this.audioCtx.currentTime + time + dur);
      };

      // Play a pleasant "Ding-Dong" doorbell chime
      playTone(659.25, 0, 0.6);    // E5
      playTone(523.25, 0.4, 0.8);  // C5
    } catch (e) {
      console.log('Audio play failed', e);
    }
  }

  // ===== ANNOUNCEMENT =====
  setAnnouncement(message) {
    this.announcement = {
      message: message,
      timestamp: new Date().getTime()
    };
    this.playNotificationSound();
    this.saveData();
    this.renderDashboard();
  }

  // ===== DATA LOADING (API + localStorage fallback) =====
  async loadData() {
    try {
      let rawData = null;
      let dataChanged = false;
      
      const response = await fetch('/api/getData?t=' + new Date().getTime(), { cache: 'no-store' });
      if (response.ok) {
        rawData = await response.text();
        this.updateConnectionStatus(true);
      } else {
        rawData = this.getLocalRawData();
        this.updateConnectionStatus(false);
      }

      if (this.lastRawData !== rawData) {
        this.lastRawData = rawData;
        dataChanged = true;
        
        try {
          const data = JSON.parse(rawData);
          if (data.equipments) {
            this.parseEquipments(data.equipments);
          } else {
            this.loadFromLocalStorage();
          }
          if (data.history) this.history = data.history;
          if (data.users) this.users = data.users;
          if (data.chatMessages) this.chatMessages = data.chatMessages;
          if (data.announcement) this.announcement = data.announcement;
          this.cleanupExpiredWarns();
        } catch(err) {
          console.warn("Eroare la parsare date JSON:", err);
        }
      }
      return dataChanged;
    } catch (e) {
      console.warn("API not accessible. Using local storage.");
      this.updateConnectionStatus(false);
      const localRaw = this.getLocalRawData();
      if (this.lastRawData !== localRaw) {
        this.lastRawData = localRaw;
        this.loadFromLocalStorage();
        return true;
      }
      return false;
    }
  }

  getLocalRawData() {
    return JSON.stringify({
      equipments: JSON.parse(localStorage.getItem('spalatorie_equipments') || 'null'),
      history: JSON.parse(localStorage.getItem('spalatorie_history') || 'null'),
      users: JSON.parse(localStorage.getItem('spalatorie_users') || 'null'),
      chatMessages: JSON.parse(localStorage.getItem('spalatorie_chat') || 'null'),
      announcement: JSON.parse(localStorage.getItem('spalatorie_announcement') || 'null')
    });
  }

  loadFromLocalStorage() {
    try {
      const savedEq = localStorage.getItem('spalatorie_equipments');
      const savedHist = localStorage.getItem('spalatorie_history');
      const savedUsers = localStorage.getItem('spalatorie_users');
      const savedChat = localStorage.getItem('spalatorie_chat');
      const savedStrike = localStorage.getItem('spalatorie_strike_history');
      if (savedEq) this.parseEquipments(JSON.parse(savedEq) || []);
      if (savedHist) this.history = JSON.parse(savedHist) || [];
      if (savedUsers) this.users = JSON.parse(savedUsers) || [];
      if (savedChat) this.chatMessages = JSON.parse(savedChat) || [];
      if (savedStrike) this.strikeHistory = JSON.parse(savedStrike) || [];
      const savedAnn = localStorage.getItem('spalatorie_announcement');
      if (savedAnn) this.announcement = JSON.parse(savedAnn);
    } catch (e) {
      console.warn("Eroare la citirea din local storage:", e);
      // Fallback la date default dacă e corupt
      this.equipments = [
        { id: 'washer-1', name: 'Mașină Ușă', type: 'washer', status: 'Liber', bookings: [] },
        { id: 'washer-2', name: 'Mașină Mijloc', type: 'washer', status: 'Liber', bookings: [] },
        { id: 'washer-3', name: 'Mașină Geam', type: 'washer', status: 'Liber', bookings: [] },
        { id: 'dryer-1', name: 'Uscător Ușă', type: 'dryer', status: 'Indisponibil momentan', bookings: [] },
        { id: 'dryer-2', name: 'Uscător Geam', type: 'dryer', status: 'Indisponibil momentan', bookings: [] }
      ];
    }
  }

  parseEquipments(parsedEq) {
    this.equipments = parsedEq.map(eq => {
      if (!eq.bookings) eq.bookings = [];
      if (eq.user && eq.time && eq.status === 'Ocupat') {
        eq.bookings.push({
          id: Date.now().toString() + Math.random(),
          user: eq.user,
          ap: eq.ap,
          date: this.getLocalDateStr(new Date()),
          startTime: '12:00',
          endTime: '14:00',
          status: 'Programat'
        });
        eq.user = null;
        eq.ap = null;
        eq.time = null;
      }
      return eq;
    });

    const namesMap = {
      'washer-1': 'Mașină Ușă',
      'washer-2': 'Mașină Mijloc',
      'washer-3': 'Mașină Geam',
      'dryer-1': 'Uscător Ușă',
      'dryer-2': 'Uscător Geam'
    };
    this.equipments.forEach(eq => {
      eq.name = namesMap[eq.id];
      if (eq.type === 'dryer') {
        eq.status = 'Indisponibil momentan';
        eq.bookings = [];
      }
    });
  }

  // ===== DATA SAVING (API + localStorage) =====
  async saveData() {
    localStorage.setItem('spalatorie_equipments', JSON.stringify(this.equipments));
    localStorage.setItem('spalatorie_history', JSON.stringify(this.history));
    localStorage.setItem('spalatorie_users', JSON.stringify(this.users));
    localStorage.setItem('spalatorie_chat', JSON.stringify(this.chatMessages));
    localStorage.setItem('spalatorie_announcement', JSON.stringify(this.announcement));

    try {
      const payload = JSON.stringify({
        equipments: this.equipments,
        history: this.history,
        users: this.users,
        chatMessages: this.chatMessages,
        announcement: this.announcement
      });

      const res = await fetch('/api/saveData', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload
      });

      if (res.ok) {
        const result = await res.json();
        if (result.status === 'success') {
          this.updateConnectionStatus(true);
          console.log('✅ Date salvate pe server (' + (result.engine || 'OK') + ')');
        } else {
          console.warn('⚠️ Server a returnat eroare:', result);
          this.updateConnectionStatus(false);
          this.showToast('Eroare la salvare pe server: ' + (result.message || 'necunoscută'), 'error');
        }
      } else {
        const errText = await res.text();
        console.error('❌ Server HTTP error:', res.status, errText);
        this.updateConnectionStatus(false);
        this.showToast('Serverul a returnat eroarea ' + res.status + '. Datele au fost salvate doar local.', 'error');
      }
    } catch (e) {
      console.warn("❌ Conexiune eșuată:", e.message);
      this.updateConnectionStatus(false);
    }
  }

  // ===== NAVIGATION =====
  setupNavigation() {
    const navLinks = document.querySelectorAll('.nav-links li');
    const sections = document.querySelectorAll('.view-section');

    navLinks.forEach(link => {
      link.addEventListener('click', () => {
        navLinks.forEach(n => n.classList.remove('active'));
        sections.forEach(s => s.classList.remove('active'));

        link.classList.add('active');
        const viewId = link.getAttribute('data-view');
        const viewSection = document.getElementById(viewId);
        if (viewSection) viewSection.classList.add('active');

        if (viewId === 'dashboard') this.renderDashboard();
        if (viewId === 'history') this.renderHistory();
        if (viewId === 'profile') this.renderProfile();
        if (viewId === 'warns') this.renderWarns();

        // Close sidebar on mobile after clicking a link
        const sidebar = document.querySelector('.sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        if (sidebar) sidebar.classList.remove('open');
        if (overlay) overlay.classList.remove('active');
      });
    });

    // Mobile Menu Toggle
    const btnMenu = document.getElementById('btn-mobile-menu');
    const overlay = document.getElementById('sidebar-overlay');
    const sidebar = document.querySelector('.sidebar');

    if (btnMenu) {
      btnMenu.addEventListener('click', () => {
        sidebar.classList.add('open');
        overlay.classList.add('active');
      });
    }

    if (overlay) {
      overlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
      });
    }
  }

  // ===== BOOKING FORM =====
  setupBookingForm() {
    const form = document.getElementById('booking-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      if (!this.loggedInUser) {
        this.showToast('Trebuie să fii logat pentru a programa!', 'error');
        return;
      }

      // Check 3 warns ban
      const liveUser = this.users.find(u => u.name === this.loggedInUser.name);
      if (liveUser && liveUser.strikes >= 3) {
        this.showToast('Contul tău are 3 avertismente (Warns)! Nu poți face programări până nu expiră cel puțin un warn (24 de ore).', 'error');
        return;
      }

      const nume = this.loggedInUser.name;
      const ap = this.loggedInUser.ap;
      const pinRezervare = this.loggedInUser.pw; // We use password instead of PIN for tracking/ownership

      const eqId = document.getElementById('echipament').value;
      const data = document.getElementById('data-rezervare').value;
      const oraInceput = document.getElementById('ora-inceput').value;
      const oraSfarsit = document.getElementById('ora-sfarsit').value;

      const eq = this.equipments.find(e => e.id === eqId);
      if (!eq) return;

      if (eq.type === 'dryer') {
        this.showToast('Acest echipament este indisponibil momentan!', 'error');
        return;
      }

      const now = new Date().getTime();
      const newStart = this.parseDateTime(data, oraInceput).getTime();
      let newEnd = this.parseDateTime(data, oraSfarsit).getTime();
      
      // Validation: Prevent booking in the past
      if (newStart < now - (5 * 60 * 1000)) {
        this.showToast('Nu poți face o programare pentru o oră care a trecut deja!', 'error');
        return;
      }
      
      // If end time is less than start time, it means it goes past midnight
      if (newEnd <= newStart) {
        newEnd += 24 * 60 * 60 * 1000;
      }
      
      // Limit to 4 hours max
      if (newEnd - newStart > 4 * 60 * 60 * 1000) {
        this.showToast('Durata maximă a unei programări este de 4 ore!', 'error');
        return;
      }

      // Validation: Check overlap on this machine
      const hasOverlap = eq.bookings.some(b => {
        if (b.status === 'Anulat' || b.status === 'Finalizat') return false;
        const bStart = this.parseDateTime(b.date, b.startTime).getTime();
        let bEnd = this.parseDateTime(b.date, b.endTime).getTime();
        if (bEnd <= bStart) bEnd += 24 * 60 * 60 * 1000;
        return (newStart < bEnd && newEnd > bStart);
      });

      if (hasOverlap) {
        this.showToast('Echipamentul este deja rezervat în acest interval orar!', 'error');
        return;
      }

      // Validation: Check if same user already has a booking on any machine at the same time
      const userOverlap = this.equipments.some(otherEq => {
        return otherEq.bookings.some(b => {
          if (b.status === 'Anulat' || b.status === 'Finalizat') return false;
          if (b.user.trim().toLowerCase() !== nume.toLowerCase() || b.ap !== ap) return false;
          const bStart = this.parseDateTime(b.date, b.startTime).getTime();
          let bEnd = this.parseDateTime(b.date, b.endTime).getTime();
          if (bEnd <= bStart) bEnd += 24 * 60 * 60 * 1000;
          return (newStart < bEnd && newEnd > bStart);
        });
      });

      if (userOverlap) {
        this.showToast('Ai deja o programare în acest interval orar! Nu poți fi în două locuri simultan.', 'error');
        return;
      }

      // Disable button during save
      const submitBtn = document.getElementById('btn-submit-booking');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Se salvează...';

      // Add Booking
      const booking = {
        id: Date.now().toString(),
        user: nume,
        ap: ap,
        date: data,
        startTime: oraInceput,
        endTime: oraSfarsit,
        status: 'Programat',
        pin: pinRezervare
      };

      eq.bookings.push(booking);
      
      this.history.unshift({
        id: booking.id,
        date: new Date().toLocaleString('ro-RO'),
        eqName: eq.name,
        user: nume,
        ap: ap,
        scheduledFor: `${data} (${oraInceput} - ${oraSfarsit})`,
        finalStatus: 'Programat'
      });

      await this.saveData();
      
      // Re-enable button
      submitBtn.disabled = false;
      submitBtn.textContent = 'Confirmă Programarea';
      
      // Show success animation
      this.showSuccessAnimation('Programare confirmată cu succes!');
      form.reset();
      
      // Navigate to dashboard
      setTimeout(() => {
        document.querySelector('[data-view="dashboard"]').click();
        this.generateWeekTabs(); // Regenerate to show new booking immediately
      }, 1600);
    });
  }

  // ===== CANCEL FORM =====
  setupCancelForm() {
    const btnSearch = document.getElementById('btn-search-cancel');
    const resultsContainer = document.getElementById('cancel-results');

    btnSearch.addEventListener('click', () => {
      if (!this.loggedInUser) {
        this.showToast('Trebuie să fii logat pentru a căuta programări!', 'error');
        return;
      }

      const nume = this.loggedInUser.name.toLowerCase();
      const ap = this.loggedInUser.ap;

      const now = new Date().getTime();
      let foundBookings = [];

      this.equipments.forEach(eq => {
        eq.bookings.forEach(b => {
          const userStr = (b.user || '').trim().toLowerCase();
          const matchesName = userStr.includes(nume) || nume.includes(userStr);
          const matchesAp = b.ap && b.ap.toString() === ap.toString();
          
          if (matchesName && matchesAp && b.status !== 'Anulat' && b.status !== 'Finalizat') {
            const bStart = this.parseDateTime(b.date, b.startTime).getTime();
            let bEnd = this.parseDateTime(b.date, b.endTime).getTime();
            if (bEnd <= bStart) bEnd += 24 * 60 * 60 * 1000;
            // Allow cancelling if it hasn't ended yet
            if (bEnd > now) {
              foundBookings.push({ eq, booking: b });
            }
          }
        });
      });

      resultsContainer.innerHTML = '';

      if (foundBookings.length === 0) {
        resultsContainer.innerHTML = `<div class="info-row" style="color:var(--text-muted);">Nu am găsit nicio programare activă.</div>`;
        return;
      }

      foundBookings.forEach(({ eq, booking }) => {
        const item = document.createElement('div');
        item.style.padding = '10px';
        item.style.background = 'rgba(0,0,0,0.3)';
        item.style.borderRadius = '8px';
        item.style.border = '1px solid var(--glass-border)';
        item.style.display = 'flex';
        item.style.justifyContent = 'space-between';
        item.style.alignItems = 'center';

        item.innerHTML = `
          <div>
            <div style="font-weight:bold; color:var(--primary-color);">${eq.name}</div>
            <div style="font-size:0.85rem; color:#FFF;">${booking.date} &bull; ${booking.startTime} - ${booking.endTime}</div>
          </div>
          <div style="display:flex; gap:5px;">
            <button class="btn-primary btn-cancel-booking" style="background:#ff4d4d; border:none; padding:5px 10px; font-size:0.85rem; border-radius:5px; width:auto;">Anulează</button>
            <button class="btn-primary btn-trade-booking" style="background:#8B5CF6; border:none; padding:5px 10px; font-size:0.85rem; border-radius:5px; width:auto;">La schimb</button>
          </div>
        `;

        item.querySelector('.btn-cancel-booking').addEventListener('click', () => {
          if (confirm('Ești sigur că vrei să anulezi definitiv această programare?')) {
            const histEntry = this.history.find(h => h.id === booking.id);
            if (histEntry) {
              histEntry.finalStatus = 'ANULAT';
            } else {
              this.history.unshift({
                id: booking.id,
                date: new Date().toLocaleString('ro-RO'),
                eqName: eq.name,
                user: booking.user,
                ap: booking.ap,
                scheduledFor: `${booking.date} (${booking.startTime} - ${booking.endTime})`,
                finalStatus: 'ANULAT'
              });
            }
            this.saveData();
            this.renderDashboard();
            if (this.currentWeeklyDate) this.renderWeeklySchedule(this.currentWeeklyDate);
            this.showToast('Programare anulată cu succes!');
            btnSearch.click(); // re-trigger search to update list
          }
        });

        item.querySelector('.btn-trade-booking').addEventListener('click', () => {
          if (confirm('Dacă oferi programarea la schimb, oricine o va putea revendica din meniul principal. Continuăm?')) {
            booking.status = 'La schimb';
            this.saveData();
            this.renderDashboard();
            this.showToast('Programarea a fost pusă la schimb!', 'success');
            btnSearch.click();
          }
        });

        resultsContainer.appendChild(item);
      });
    });
  }

  // ===== STATUS COLOR =====
  getStatusColor(status) {
    switch (status) {
      case 'Liber': return 'var(--status-liber)';
      case 'Ocupat': return 'var(--status-ocupat)';
      case 'Anulat': return 'var(--status-anulat)';
      case 'Donat către': return 'var(--status-donat)';
      default: return 'var(--text-muted)';
    }
  }

  // ===== STATS UPDATE =====
  updateStats() {
    const now = new Date().getTime();
    const todayStr = this.getLocalDateStr(new Date());
    
    let libere = 0, ocupate = 0, programariAzi = 0;
    const locatariSet = new Set();

    this.equipments.forEach(eq => {
      if (eq.type === 'dryer') return; // skip dryers

      let isOccupied = false;
      eq.bookings.forEach(b => {
        if (b.status === 'Anulat' || b.status === 'Finalizat') return;
        
        const bStart = this.parseDateTime(b.date, b.startTime).getTime();
        let bEnd = this.parseDateTime(b.date, b.endTime).getTime();
        if (bEnd <= bStart) bEnd += 24 * 60 * 60 * 1000;
        
        if (now >= bStart && now <= bEnd) {
          isOccupied = true;
        }
        
        if (b.date === todayStr) {
          programariAzi++;
          locatariSet.add(b.user.toLowerCase());
        }
      });

      if (isOccupied) ocupate++;
      else libere++;
    });

    const elLibere = document.getElementById('stat-libere');
    const elOcupate = document.getElementById('stat-ocupate');
    const elProgramari = document.getElementById('stat-programari');
    const elUtilizatori = document.getElementById('stat-utilizatori');

    if (elLibere) elLibere.textContent = libere;
    if (elOcupate) elOcupate.textContent = ocupate;
    if (elProgramari) elProgramari.textContent = programariAzi;
    if (elUtilizatori) elUtilizatori.textContent = locatariSet.size;
  }

  // ===== RENDER DASHBOARD =====
  renderDashboard() {
    const washersContainer = document.getElementById('washers-container');
    const dryersContainer = document.getElementById('dryers-container');
    
    washersContainer.innerHTML = '';
    dryersContainer.innerHTML = '';

    this.renderAnnouncement();

    const now = new Date().getTime();

    this.equipments.forEach(eq => {
      // Sort bookings by date and start time
      eq.bookings.sort((a, b) => this.parseDateTime(a.date, a.startTime).getTime() - this.parseDateTime(b.date, b.startTime).getTime());
      
      // Filter out bookings that are older than 7 days to keep memory clean
      eq.bookings = eq.bookings.filter(b => {
        const bStart = this.parseDateTime(b.date, b.startTime).getTime();
        let bEnd = this.parseDateTime(b.date, b.endTime).getTime();
        if (bEnd <= bStart) bEnd += 24 * 60 * 60 * 1000;
        return bEnd > now - (7 * 24 * 60 * 60 * 1000); 
      });

      let currentActive = null;
      let upcoming = [];

      eq.bookings.forEach(b => {
        if (b.status === 'Anulat' || b.status === 'Finalizat') return;
        
        const bStart = this.parseDateTime(b.date, b.startTime).getTime();
        let bEnd = this.parseDateTime(b.date, b.endTime).getTime();
        if (bEnd <= bStart) bEnd += 24 * 60 * 60 * 1000;
        
        if (now >= bStart && now <= bEnd) {
          currentActive = b;
        } else if (bStart > now) {
          upcoming.push(b);
        }
      });

      // Only show upcoming queue if the booking is today or within 16h
      const todayStr = this.getLocalDateStr(new Date());
      upcoming = upcoming.filter(b => {
        const bStart = this.parseDateTime(b.date, b.startTime).getTime();
        return b.date === todayStr || (bStart - now < 16 * 60 * 60 * 1000);
      });

      let statusToDisplay = 'Liber';
      if (eq.type === 'dryer') {
        statusToDisplay = 'Indisponibil momentan';
      } else if (currentActive) {
        statusToDisplay = currentActive.status === 'Donat către' ? 'Donat către' : 'Ocupat';
      } else if (upcoming.length > 0) {
        statusToDisplay = 'Rezervat (Viitor)';
      }

      eq.status = statusToDisplay;

      const card = document.createElement('div');
      card.className = 'machine-card';
      
      let badgeColor = this.getStatusColor(statusToDisplay);
      if (statusToDisplay === 'Rezervat (Viitor)') badgeColor = '#3B82F6';
      if (statusToDisplay === 'Indisponibil momentan') badgeColor = '#6B7280';
      card.style.setProperty('--status-color', badgeColor);
      
      let userInfo = '';
      
      // SVG icons
      const washerSvg = `<svg width="40" height="40" viewBox="0 0 24 24" fill="#FFB300" xmlns="http://www.w3.org/2000/svg"><path d="M19 4H5C3.89543 4 3 4.89543 3 6V20C3 21.1046 3.89543 22 5 22H19C20.1046 22 21 21.1046 21 20V6C21 4.89543 20.1046 4 19 4Z" stroke="#FFB300" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 8H10" stroke="#121212" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="15" r="4" fill="#121212" stroke="#121212" stroke-width="2"/><circle cx="12" cy="15" r="2" fill="#FFB300"/></svg>`;
      const dryerSvg = `<svg width="40" height="40" viewBox="0 0 24 24" fill="#FF6B00" xmlns="http://www.w3.org/2000/svg"><path d="M19 4H5C3.89543 4 3 4.89543 3 6V20C3 21.1046 3.89543 22 5 22H19C20.1046 22 21 21.1046 21 20V6C21 4.89543 20.1046 4 19 4Z" stroke="#FF6B00" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="14" r="5" fill="none" stroke="#121212" stroke-width="2" stroke-dasharray="4 4"/><path d="M7 8H17" stroke="#121212" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      
      const iconToUse = eq.type === 'washer' ? washerSvg : dryerSvg;

      // Add pulse class if active
      const pulseClass = currentActive ? 'active-pulse' : '';

      if (currentActive) {
        let activeEndTimestamp = this.parseDateTime(currentActive.date, currentActive.endTime).getTime();
        const activeStartTimestamp = this.parseDateTime(currentActive.date, currentActive.startTime).getTime();
        if (activeEndTimestamp <= activeStartTimestamp) {
          activeEndTimestamp += 24 * 60 * 60 * 1000;
        }

        let nextPersonHtml = '';
        if (upcoming.length > 0) {
          const next = upcoming[0];
          nextPersonHtml = `
            <div class="info-row" style="margin-top:8px; color:var(--primary-color); font-size: 0.95rem;">
              <ion-icon name="arrow-forward-outline"></ion-icon> <strong>Următorul:</strong> ${next.user} (Ap. ${next.ap}) de la ${next.startTime}
            </div>
          `;
        } else {
          nextPersonHtml = `
            <div class="info-row" style="margin-top:8px; color:var(--text-muted); font-size: 0.95rem;">
              <ion-icon name="arrow-forward-outline"></ion-icon> <strong>Următorul:</strong> Nimeni momentan
            </div>
          `;
        }

        userInfo += `
          <div style="margin-bottom:10px; padding-bottom:10px; border-bottom:1px solid rgba(255,255,255,0.1);">
            <div class="info-row"><ion-icon name="play-circle-outline"></ion-icon> <span style="color:var(--primary-color); font-weight:bold;">ACUM:</span></div>
            <div class="info-row"><ion-icon name="person-outline"></ion-icon> <span class="info-value">${currentActive.user} (Ap. ${currentActive.ap})</span></div>
            <div class="info-row"><ion-icon name="time-outline"></ion-icon> <span class="info-value">${currentActive.startTime} - ${currentActive.endTime}</span></div>
            <div class="realtime-timer info-row" data-id="${currentActive.id}" data-eqid="${eq.id}" data-start="${activeStartTimestamp}" data-end="${activeEndTimestamp}" style="color:var(--primary-color); font-weight:bold; font-size: 1.1rem; margin-top:5px;">
              <ion-icon name="hourglass-outline"></ion-icon> Rămas: Calculare...
            </div>
            <div class="timer-progress-bar">
              <div class="timer-progress-fill" data-start="${activeStartTimestamp}" data-end="${activeEndTimestamp}" style="width: 0%"></div>
            </div>
            ${nextPersonHtml}
          </div>
        `;
      } else if (eq.type === 'dryer') {
        userInfo += `<div class="info-row" style="margin-bottom:10px; color: var(--status-ocupat);"><ion-icon name="close-circle-outline"></ion-icon> <span class="info-value">Echipament defect / Indisponibil</span></div>`;
      } else if (upcoming.length > 0) {
        userInfo += `<div class="info-row" style="margin-bottom:10px; color: #3B82F6;"><ion-icon name="calendar-outline"></ion-icon> <span class="info-value">Liber, dar rezervat în viitor</span></div>`;
      } else {
        userInfo += `<div class="info-row" style="margin-bottom:10px;"><ion-icon name="checkmark-circle-outline"></ion-icon> <span class="info-value">Disponibil acum</span></div>`;
      }

      // Remaining upcoming items
      const remainingUpcoming = currentActive ? upcoming.slice(1) : upcoming;

      if (remainingUpcoming.length > 0) {
        userInfo += `<div class="info-row" style="margin-top:5px; color:var(--text-muted); font-size:0.9rem;"><ion-icon name="list-outline"></ion-icon> <strong>Așteaptă la rând:</strong></div>`;
        remainingUpcoming.slice(0, 3).forEach(b => {
          userInfo += `
            <div class="info-row" style="font-size: 0.85rem; margin-left: 20px; color: #FFF;">
              - ${b.user} (Ap. ${b.ap}) &nbsp;|&nbsp; <span style="color: var(--primary-color);">${b.date} &bull; ${b.startTime} - ${b.endTime}</span>
            </div>
          `;
        });
        if (remainingUpcoming.length > 3) {
          userInfo += `<div style="font-size: 0.8rem; margin-left: 20px; color: var(--text-muted);">...și încă ${remainingUpcoming.length - 3} programări în așteptare.</div>`;
        }
      }

      // Check for trade offers
      const tradeOffers = eq.bookings.filter(b => b.status === 'La schimb' && this.parseDateTime(b.date, b.endTime).getTime() > now);
      if (tradeOffers.length > 0) {
        userInfo += `<div style="margin-top: 15px; border-top: 1px dashed var(--glass-border); padding-top: 10px;">`;
        tradeOffers.forEach(trade => {
          userInfo += `
            <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(139, 92, 246, 0.1); padding: 8px; border-radius: 6px; margin-bottom: 5px;">
              <div>
                <span class="trade-badge">La schimb</span>
                <div style="font-size:0.8rem; color:var(--text-main); margin-top:4px;">${trade.date} &bull; ${trade.startTime} - ${trade.endTime}</div>
              </div>
              <button class="btn-trade btn-claim-trade" data-id="${trade.id}" style="font-weight:bold;">Revendică</button>
            </div>
          `;
        });
        userInfo += `</div>`;
      }

      card.innerHTML = `
        <div class="card-header">
          <div style="display:flex; align-items:center; gap:10px;">
            ${iconToUse}
            <span class="machine-id">${eq.name}</span>
          </div>
          <span class="status-badge ${pulseClass}" style="color:${badgeColor}; border-color:${badgeColor}">${statusToDisplay}</span>
        </div>
        <div class="card-body">
          ${userInfo}
        </div>
        <div class="action-hint">Click pentru a gestiona programarea curentă</div>
      `;

      card.onclick = (e) => {
        if (e.target.classList.contains('btn-claim-trade')) return; // handled separately
        const targetBooking = currentActive || (upcoming.length > 0 ? upcoming[0] : null);
        this.openModal(eq, targetBooking, !!currentActive);
      };

      card.querySelectorAll('.btn-claim-trade').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          
          if (!this.loggedInUser) {
            this.showToast('Trebuie să fii logat pentru a revendica!', 'error');
            return;
          }

          const tradeId = btn.getAttribute('data-id');
          const tradeBooking = eq.bookings.find(b => b.id === tradeId);
          if (!tradeBooking) return;

          tradeBooking.user = this.loggedInUser.name;
          tradeBooking.ap = this.loggedInUser.ap;
          tradeBooking.pin = this.loggedInUser.pw;
          tradeBooking.status = 'Rezervat';

          this.showSuccessAnimation('Ai revendicat programarea cu succes!');
          this.saveData();
          this.renderDashboard();
        });
      });

      if (eq.type === 'washer') washersContainer.appendChild(card);
      else dryersContainer.appendChild(card);
    });

    // Update stats after rendering
    this.updateStats();
  }

  // ===== ANNOUNCEMENT BANNER =====
  renderAnnouncement() {
    const bannerContainer = document.getElementById('announcement-banner-container');
    if (!this.announcement) {
      bannerContainer.innerHTML = '';
      return;
    }

    const age = new Date().getTime() - this.announcement.timestamp;
    // Dispare automat după 5 minute (300,000 ms) în loc de 2 ore
    if (age > 5 * 60 * 1000) {
      this.announcement = null;
      this.saveData();
      bannerContainer.innerHTML = '';
      return;
    }

    bannerContainer.innerHTML = `
      <div class="announcement-banner">
        <ion-icon name="volume-high-outline"></ion-icon>
        <div class="announcement-content">
          <h4>ANUNȚ IMPORTANT</h4>
          <p>${this.announcement.message}</p>
        </div>
      </div>
    `;
  }

  // ===== UPCOMING ANNOUNCEMENTS =====
  checkUpcomingAnnouncements() {
    const now = new Date().getTime();
    let needsSave = false;

    this.equipments.forEach(eq => {
      eq.bookings.forEach(b => {
        if (b.status === 'Anulat' || b.status === 'Finalizat') return;
        
        const bStart = this.parseDateTime(b.date, b.startTime).getTime();
        const diff = bStart - now;
        
        if (diff > 0 && diff <= 5 * 60 * 1000 && !b.announced) {
          b.announced = true;
          needsSave = true;
          this.setAnnouncement(`Pregătește-te! Peste aprox. 5 minute urmează programarea lui <strong>${b.user} (Ap. ${b.ap})</strong> la <strong>${eq.name}</strong>.`);
        }
      });
    });

    if (needsSave) {
      this.saveData();
      this.renderDashboard();
    }
  }

  // ===== WEEK TABS =====
  generateWeekTabs() {
    const startDay = new Date();

    const dayNames = ['Duminică', 'Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă'];
    this.weekDates = [];

    const tabsContainer = document.getElementById('days-tabs');
    if (!tabsContainer) return;
    tabsContainer.innerHTML = '';

    const currentDateStr = this.getLocalDateStr(startDay);
    let activeDateStr = null;
    
    for (let i = 0; i < 7; i++) {
      const d = new Date(startDay);
      d.setDate(startDay.getDate() + i);
      const dateStr = this.getLocalDateStr(d);
      this.weekDates.push(dateStr);

      const btn = document.createElement('button');
      btn.className = 'day-tab';
      if (dateStr === currentDateStr) {
        btn.classList.add('active');
        activeDateStr = dateStr;
      }
      
      const parts = dateStr.split('-');
      
      let labelName = dayNames[d.getDay()];
      if (i === 0) labelName = 'Azi';
      if (i === 1) labelName = 'Mâine';

      btn.textContent = `${labelName} (${parts[2]}/${parts[1]})`;
      
      btn.addEventListener('click', () => {
        document.querySelectorAll('.day-tab').forEach(t => t.classList.remove('active'));
        btn.classList.add('active');
        this.renderWeeklySchedule(dateStr);
      });
      tabsContainer.appendChild(btn);
    }
    
    this.currentWeeklyDate = activeDateStr || this.weekDates[0];
    if (!activeDateStr && tabsContainer.firstChild) tabsContainer.firstChild.classList.add('active');
    this.renderWeeklySchedule(this.currentWeeklyDate);
  }

  // ===== WEEKLY SCHEDULE TABLE =====
  renderWeeklySchedule(dateStr) {
    this.currentWeeklyDate = dateStr;
    const tbody = document.getElementById('weekly-table-body');
    const noData = document.getElementById('no-weekly-data');
    if (!tbody || !noData) return;
    
    tbody.innerHTML = '';
    
    let allBookings = [];
    this.equipments.forEach(eq => {
      eq.bookings.forEach(b => {
        if (b.date === dateStr && b.status !== 'Anulat') {
          allBookings.push({ ...b, eqName: eq.name });
        }
      });
    });

    allBookings.sort((a, b) => this.parseDateTime(a.date, a.startTime).getTime() - this.parseDateTime(b.date, b.startTime).getTime());

    const now = new Date().getTime();

    if (allBookings.length === 0) {
      noData.style.display = 'block';
    } else {
      noData.style.display = 'none';
      allBookings.forEach(b => {
        const bStart = this.parseDateTime(b.date, b.startTime).getTime();
        let bEnd = this.parseDateTime(b.date, b.endTime).getTime();
        if (bEnd <= bStart) bEnd += 24 * 60 * 60 * 1000;

        let displayStatus = 'PROGRAMAT';
        if (b.status === 'Finalizat') {
          displayStatus = 'FINALIZAT';
        } else if (b.status === 'Donat către') {
          displayStatus = 'DONAT';
        } else if (now >= bStart && now <= bEnd) {
          displayStatus = 'ÎN CURS DE FINALIZARE';
        } else if (now > bEnd) {
          displayStatus = 'EXPIRAT';
        } else if (b.status && b.status !== 'Programat') {
          displayStatus = b.status.toUpperCase();
        }

        // Color-code the status
        let statusColor = 'var(--text-muted)';
        if (displayStatus === 'ÎN CURS DE FINALIZARE') statusColor = 'var(--status-ocupat)';
        else if (displayStatus === 'PROGRAMAT') statusColor = 'var(--primary-color)';
        else if (displayStatus === 'FINALIZAT') statusColor = 'var(--status-liber)';
        else if (displayStatus === 'DONAT') statusColor = 'var(--status-donat)';

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong style="color:var(--primary-color)">${b.startTime} - ${b.endTime}</strong></td>
          <td>${b.eqName}</td>
          <td>${b.user} (Ap. ${b.ap})</td>
          <td><span class="status-badge" style="border: 1px solid ${statusColor}; color: ${statusColor}; background: rgba(255,255,255,0.05)">${displayStatus}</span></td>
        `;
        tbody.appendChild(tr);
      });
    }
  }

  // ===== TICK TIMERS =====
  tickTimers() {
    // Live Clock Update
    const clockEl = document.getElementById('live-clock');
    if (clockEl) {
      const Acum = new Date();
      const timeStr = Acum.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      clockEl.textContent = timeStr;
    }

    const timers = document.querySelectorAll('.realtime-timer');
    const now = new Date().getTime();
    let needsRender = false;

    timers.forEach(timer => {
      const endTimestamp = parseInt(timer.getAttribute('data-end'), 10);
      const startTimestamp = parseInt(timer.getAttribute('data-start'), 10);
      const eqId = timer.getAttribute('data-eqid');
      const bookingId = timer.getAttribute('data-id');
      
      const diff = endTimestamp - now;

      if (diff <= 0) {
        timer.innerHTML = `<ion-icon name="checkmark-done-outline"></ion-icon> Ciclul s-a încheiat!`;
        
        const eq = this.equipments.find(e => e.id === eqId);
        if (eq) {
          const finishedBooking = eq.bookings.find(b => b.id === bookingId);
          if (finishedBooking && finishedBooking.status !== 'Finalizat') {
            finishedBooking.status = 'Finalizat';
            
            // Increment washes for badges
            const userAccount = this.users.find(u => u.name === finishedBooking.user);
            if (userAccount) {
              if (!userAccount.washes) userAccount.washes = 0;
              userAccount.washes++;
              
              if (this.loggedInUser && this.loggedInUser.name === userAccount.name) {
                this.loggedInUser.washes = userAccount.washes;
                localStorage.setItem('spalatorie_logged_in', JSON.stringify(this.loggedInUser));
              }
            }
            
            const histEntry = this.history.find(h => h.id === finishedBooking.id);
            if (histEntry) {
              histEntry.finalStatus = 'Finalizat';
            } else {
              this.history.unshift({
                id: finishedBooking.id,
                date: new Date().toLocaleString('ro-RO'),
                eqName: eq.name,
                user: finishedBooking.user,
                ap: finishedBooking.ap,
                scheduledFor: `${finishedBooking.date} (${finishedBooking.startTime} - ${finishedBooking.endTime})`,
                finalStatus: 'Finalizat'
              });
            }
            
            // Check if there is a NEXT booking (fixed sorting bug)
            const futureBookings = eq.bookings.filter(b => {
              if (b.status === 'Anulat' || b.status === 'Finalizat') return false;
              const bStart = this.parseDateTime(b.date, b.startTime).getTime();
              return bStart > now;
            }).sort((a, b) => this.parseDateTime(a.date, a.startTime).getTime() - this.parseDateTime(b.date, b.startTime).getTime());

            if (futureBookings.length > 0) {
              const nextB = futureBookings[0];
              this.setAnnouncement(`Ciclul s-a încheiat la <strong>${eq.name}</strong>! Urmează programarea lui <strong>${nextB.user}</strong> de la Apartamentul <strong>${nextB.ap}</strong>.`);
            } else {
              this.setAnnouncement(`Ciclul s-a încheiat la <strong>${eq.name}</strong>! Mașina este acum liberă.`);
            }
            this.saveData();
            needsRender = true;
          }
        }
      } else {
        const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((diff % (1000 * 60)) / 1000);
        
        timer.innerHTML = `<ion-icon name="hourglass-outline"></ion-icon> Rămas: ${h > 0 ? h + 'h ' : ''}${m}m ${s}s`;
      }
    });

    // Update progress bars
    document.querySelectorAll('.timer-progress-fill').forEach(bar => {
      const start = parseInt(bar.getAttribute('data-start'), 10);
      const end = parseInt(bar.getAttribute('data-end'), 10);
      const total = end - start;
      const elapsed = now - start;
      const pct = Math.min(100, Math.max(0, (elapsed / total) * 100));
      bar.style.width = pct + '%';
    });

    if (needsRender) {
      this.renderDashboard();
      if (this.currentWeeklyDate) this.renderWeeklySchedule(this.currentWeeklyDate);
    }
  }

  // ===== RENDER WARNS =====
  renderWarns() {
    const tbody = document.getElementById('warns-table-body');
    const noWarnings = document.getElementById('no-warnings');
    
    if (!tbody || !noWarnings) return;

    const warnedUsers = this.users.filter(u => u.strikes > 0);

    tbody.innerHTML = '';
    
    if (warnedUsers.length === 0) {
      noWarnings.style.display = 'block';
      return;
    }

    noWarnings.style.display = 'none';
    
    const isAdmin = this.loggedInUser && (this.loggedInUser.role === 'admin' || this.loggedInUser.role === 'developer' || this.loggedInUser.role === 'sef');

    warnedUsers.forEach(u => {
      // Legacy strike fallback
      if (!u.strikeHistory || u.strikeHistory.length === 0) {
        if (u.strikes > 0) {
          const tr = document.createElement('tr');
          let dateIssuedStr = '-';
          let expiryDateStr = '-';
          if (u.lastStrikeDate) dateIssuedStr = new Date(u.lastStrikeDate).toLocaleDateString('ro-RO');
          if (u.strikeExpiryDate) expiryDateStr = new Date(u.strikeExpiryDate).toLocaleDateString('ro-RO');
          tr.innerHTML = `
            <td><strong>${u.name}</strong></td>
            <td>${dateIssuedStr}</td>
            <td>${expiryDateStr}</td>
            <td><span style="background: rgba(239, 68, 68, 0.2); padding: 4px 8px; border-radius: 4px; font-weight: bold; color: #EF4444;">${u.strikes}/3</span></td>
          `;
          tbody.appendChild(tr);
        }
        return;
      }

      // New system with history
      u.strikeHistory.forEach((strike, index) => {
        const tr = document.createElement('tr');
        const d = new Date(strike.date);
        const e = new Date(strike.expiry);
        const displayDate = `${d.toLocaleDateString('ro-RO')} ${d.toLocaleTimeString('ro-RO', {hour: '2-digit', minute:'2-digit'})}`;
        const displayExpiry = `${e.toLocaleDateString('ro-RO')} ${e.toLocaleTimeString('ro-RO', {hour: '2-digit', minute:'2-digit'})}`;
        
        let actionsHtml = '';
        if (isAdmin) {
          actionsHtml = `<button class="btn-remove-warn" data-user="${u.name}" data-index="${index}" style="background:none; border:none; color:var(--status-liber); font-size:1.2rem; cursor:pointer;" title="Șterge Warn"><ion-icon name="trash"></ion-icon></button>`;
        }

        tr.innerHTML = `
          <td><strong>${u.name}</strong> ${index > 0 ? '<small>(Warn #' + (index+1) + ')</small>' : ''}</td>
          <td>${displayDate}</td>
          <td>${displayExpiry}</td>
          <td style="display:flex; align-items:center; gap:10px;"><span style="background: rgba(239, 68, 68, 0.2); padding: 4px 8px; border-radius: 4px; font-weight: bold; color: #EF4444;">${u.strikes}/3</span> ${actionsHtml}</td>
        `;
        tbody.appendChild(tr);
      });
    });

    // Add delete listeners
    tbody.querySelectorAll('.btn-remove-warn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const userName = e.currentTarget.getAttribute('data-user');
        const index = parseInt(e.currentTarget.getAttribute('data-index'));
        
        const user = this.users.find(u => u.name === userName);
        if (user && user.strikeHistory) {
          user.strikeHistory.splice(index, 1);
          user.strikes = user.strikeHistory.length;
          this.saveData();
          this.renderWarns();
          this.showToast('Warn eliminat cu succes!', 'success');
        }
      });
    });
  }

  // ===== CLEANUP EXPIRED WARNS =====
  cleanupExpiredWarns() {
    let changed = false;
    const now = new Date();
    
    this.users.forEach(u => {
      // Clean up new system
      if (u.strikeHistory && u.strikeHistory.length > 0) {
        const originalLength = u.strikeHistory.length;
        u.strikeHistory = u.strikeHistory.filter(s => new Date(s.expiry) >= now);
        if (u.strikeHistory.length !== originalLength) {
          u.strikes = u.strikeHistory.length;
          changed = true;
        }
      } 
      // Clean up old system
      else if (u.strikes > 0 && u.strikeExpiryDate) {
        if (new Date(u.strikeExpiryDate) < now) {
          u.strikes = 0;
          u.lastStrikeDate = null;
          u.strikeExpiryDate = null;
          changed = true;
        }
      }
    });

    if (changed) this.saveData();
  }

  // ===== RENDER HISTORY =====
  renderHistory() {
    const tbody = document.getElementById('history-body');
    const noData = document.getElementById('no-history');
    
    tbody.innerHTML = '';
    
    if (this.history.length === 0) {
      noData.style.display = 'block';
      return;
    }
    
    noData.style.display = 'none';

    this.history.forEach(h => {
      const tr = document.createElement('tr');
      
      // Color code final status
      let statusStyle = 'background: rgba(255,255,255,0.1); border: 1px solid var(--text-muted);';
      if (h.finalStatus === 'Programat') statusStyle = 'background: rgba(255,179,0,0.15); border: 1px solid var(--primary-color); color: var(--primary-color);';
      else if (h.finalStatus.toUpperCase().includes('ANULAT')) statusStyle = 'background: rgba(239,68,68,0.15); border: 1px solid var(--status-ocupat); color: var(--status-ocupat);';
      else if (h.finalStatus === 'Finalizat' || h.finalStatus === 'Liber') statusStyle = 'background: rgba(16,185,129,0.15); border: 1px solid var(--status-liber); color: var(--status-liber);';
      
      tr.innerHTML = `
        <td>${h.date}</td>
        <td><strong>${h.eqName}</strong><br><small>${h.scheduledFor}</small></td>
        <td>${h.user}</td>
        <td>Ap. ${h.ap}</td>
        <td><span class="status-badge" style="${statusStyle}">${h.finalStatus}</span></td>
      `;
      tbody.appendChild(tr);
    });
  }

  // ===== MODAL =====
  setupModal() {
    const modal = document.getElementById('action-modal');
    const closeBtn = document.querySelector('.close-modal');
    
    // Clear History Button
    const btnClearHistory = document.getElementById('btn-clear-history');
    if (btnClearHistory) {
      btnClearHistory.addEventListener('click', () => {
        const pin = prompt('Introduceți PIN-ul Master pentru a șterge istoricul (PIN: 0000):');
        if (pin === null) return;
        if (pin === '0000') {
          this.history = [];
          this.saveData();
          this.renderHistory();
          this.showToast('Istoricul a fost curățat complet.');
        } else {
          this.showToast('PIN Master incorect!', 'error');
        }
      });
    }

    closeBtn.addEventListener('click', () => {
      modal.classList.remove('active');
    });

    window.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('active');
    });

    // Action buttons
    document.querySelectorAll('.btn-status:not(#btn-donate)').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const newStatus = e.target.getAttribute('data-status');
        this.updateMachineStatus(newStatus);
      });
    });

    // Donate button
    document.getElementById('btn-donate').addEventListener('click', () => {
      const donateName = document.getElementById('donate-name').value.trim();
      if (!donateName) {
        this.showToast('Introdu numele persoanei către care donezi!', 'error');
        return;
      }
      this.updateMachineStatus('Donat către', donateName);
    });

    // Announce button
    document.getElementById('btn-announce').addEventListener('click', () => {
      if (!this.currentActionMachine) return;
      
      const eq = this.currentActionMachine;
      const now = new Date().getTime();
      
      const futureBookings = eq.bookings.filter(b => {
        if (b.status === 'Anulat' || b.status === 'Finalizat') return false;
        const bStart = this.parseDateTime(b.date, b.startTime).getTime();
        return bStart > now;
      }).sort((a, b) => this.parseDateTime(a.date, a.startTime).getTime() - this.parseDateTime(b.date, b.startTime).getTime());

      if (futureBookings.length === 0) {
        this.showToast('Nu există nicio programare viitoare pentru acest echipament pe care să o anunți.', 'error');
        return;
      }

      const nextBooking = futureBookings[0];
      
      this.setAnnouncement(`Urmează <strong>${nextBooking.user} (Ap. ${nextBooking.ap})</strong> la <strong>${eq.name}</strong>!`);
      
      this.saveData();
      this.renderDashboard();
      document.getElementById('action-modal').classList.remove('active');
      this.showToast('Anunțul a fost publicat cu succes!');
    });
  }

  openModal(eq, targetBooking, isActive = true) {
    this.currentActionMachine = eq;
    this.currentActiveBooking = targetBooking;

    document.getElementById('modal-title').textContent = eq.name;
    
    if (targetBooking) {
      const prefix = isActive ? 'Programare curentă' : 'Următoarea programare';
      document.getElementById('modal-subtitle').textContent = `${prefix}: ${targetBooking.user} (${targetBooking.date} | ${targetBooking.startTime} - ${targetBooking.endTime})`;
    } else {
      document.getElementById('modal-subtitle').textContent = `Echipamentul este complet liber. Nicio programare.`;
    }

    document.getElementById('donate-name').value = '';
    document.getElementById('action-modal').classList.add('active');
  }

  updateMachineStatus(newStatus, donateName = null) {
    if (!this.currentActionMachine) return;
    
    const eq = this.currentActionMachine;
    const activeBooking = this.currentActiveBooking;
    
    if (activeBooking) {
      // Require auth before any action that modifies the active booking
      if (newStatus !== 'Ocupat') {
        const isAdmin = this.loggedInUser && ['admin', 'developer', 'sefcamin'].includes(this.loggedInUser.role);
        
        if (!isAdmin) {
          if (!this.loggedInUser || this.loggedInUser.name !== activeBooking.user) {
            this.showToast('Nu ai permisiunea să modifici această programare! Doar titularul sau un admin o poate face.', 'error');
            return;
          }
          
          if (!confirm('Ești sigur că vrei să efectuezi această acțiune?')) return;
        }
      }

      let fStatus = newStatus;
      if (newStatus === 'Donat către') fStatus = `Donat: ${donateName}`;
      if (newStatus === 'Anulat') fStatus = 'ANULAT';
      
      // Update History for the transition
      const histEntry = this.history.find(h => h.id === activeBooking.id);
      if (histEntry) {
        histEntry.finalStatus = fStatus;
        if (newStatus === 'Donat către') {
          histEntry.user = donateName;
        }
      } else {
        this.history.unshift({
          id: activeBooking.id,
          date: new Date().toLocaleString('ro-RO'),
          eqName: eq.name,
          user: activeBooking.user,
          ap: activeBooking.ap,
          scheduledFor: `${activeBooking.date} (${activeBooking.startTime} - ${activeBooking.endTime})`,
          finalStatus: fStatus
        });
      }

      if (newStatus === 'Liber' || newStatus === 'Anulat') {
        activeBooking.status = 'Anulat';
        eq.bookings = eq.bookings.filter(b => b.id !== activeBooking.id);
        
        // Auto-announce next person (fixed sorting bug)
        const now = new Date().getTime();
        const futureBookings = eq.bookings.filter(b => {
          if (b.status === 'Anulat' || b.status === 'Finalizat') return false;
          return this.parseDateTime(b.date, b.startTime).getTime() > now;
        }).sort((a, b) => this.parseDateTime(a.date, a.startTime).getTime() - this.parseDateTime(b.date, b.startTime).getTime());
        
        if (futureBookings.length > 0) {
          const nextB = futureBookings[0];
          this.setAnnouncement(`<strong>${eq.name}</strong> a fost eliberată! Urmează programarea lui <strong>${nextB.user} (Ap. ${nextB.ap})</strong>.`);
        } else {
          this.setAnnouncement(`<strong>${eq.name}</strong> a fost eliberată și este acum disponibilă!`);
        }
      } else if (newStatus === 'Donat către') {
        activeBooking.status = 'Donat către';
        activeBooking.user = donateName;
      } else {
        activeBooking.status = newStatus;
      }
    } else {
       if (newStatus === 'Ocupat') {
         this.showToast('Pentru a ocupa mașina, folosește secțiunea "Programează"!', 'error');
         return;
       } else {
         this.showToast('Nu ai ce anula, acest echipament este complet liber!', 'error');
         return;
       }
    }

    this.saveData();
    this.renderDashboard();
    
    document.getElementById('action-modal').classList.remove('active');
  }

  // ===== V3.0 PREMIUM FEATURES =====

  // 1. Theme and Language Toggles
  setupThemeAndLang() {
    const themeBtn = document.getElementById('theme-toggle');
    const langBtn = document.getElementById('lang-toggle');

    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        this.isLightMode = !this.isLightMode;
        if (this.isLightMode) {
          document.body.classList.add('light-theme');
          localStorage.setItem('spalatorie_theme', 'light');
        } else {
          document.body.classList.remove('light-theme');
          localStorage.setItem('spalatorie_theme', 'dark');
        }
        this.applyTranslations(); // Re-render button text
      });
    }

    if (langBtn) {
      langBtn.addEventListener('click', () => {
        this.currentLang = this.currentLang === 'ro' ? 'en' : 'ro';
        localStorage.setItem('spalatorie_lang', this.currentLang);
        this.applyTranslations();
      });
    }
  }

  // 2. Translation Dictionary
  applyTranslations() {
    const dict = {
      ro: {
        themeToggle: this.isLightMode ? 'Dark Mode' : 'Light Mode',
        navHistory: 'Istoric Utilizări',
        navLeaderboard: 'Clasament',
        navInstructions: 'Instrucțiuni',
        leaderboardTitle: 'Clasament Apartamente',
        leaderboardDesc: 'Topul apartamentelor care folosesc spălătoria (bazat pe istoricul spălărilor finalizate).',
        adminTitle: 'Panou Administrator',
        reportBtn: 'Raportează Defecțiune'
      },
      en: {
        themeToggle: this.isLightMode ? 'Dark Mode' : 'Light Mode',
        navHistory: 'Usage History',
        navLeaderboard: 'Leaderboard',
        navInstructions: 'Instructions',
        leaderboardTitle: 'Apartment Leaderboard',
        leaderboardDesc: 'Top apartments using the laundry room (based on completed washes).',
        adminTitle: 'Admin Dashboard',
        reportBtn: 'Report Broken'
      }
    };

    const texts = dict[this.currentLang];
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (texts[key]) el.innerHTML = texts[key];
    });

    const langBtnSpan = document.querySelector('#lang-toggle span');
    if (langBtnSpan) {
      langBtnSpan.textContent = this.currentLang === 'ro' ? 'English' : 'Română';
    }
  }

  // 3. Admin Panel Logic
  setupAdminPanel() {
    const adminTriggers = document.querySelectorAll('.app-version');
    const adminView = document.getElementById('nav-admin');
    const loginPanel = document.getElementById('admin-login-panel');
    const dashboardPanel = document.getElementById('admin-dashboard-panel');
    
    // Auto-show Admin Tab if user is developer or admin
    if (this.loggedInUser && (this.loggedInUser.role === 'developer' || this.loggedInUser.role === 'admin')) {
      adminView.style.display = 'flex';
      this.isAdmin = true;
    }

    // Secret click to reveal admin tab (click version number 5 times)
    let clicks = 0;
    adminTriggers.forEach(trigger => {
      trigger.addEventListener('click', () => {
        clicks++;
        if (clicks >= 5) {
          adminView.style.display = 'flex';
          this.showToast('Panoul Secret de Admin a fost deblocat!', 'success');
          clicks = 0;
        }
        setTimeout(() => { clicks = 0; }, 3000);
      });
    });

    if (this.isAdmin || sessionStorage.getItem('spalatorie_admin') === 'true') {
      this.isAdmin = true;
      loginPanel.style.display = 'none';
      dashboardPanel.style.display = 'grid';
      adminView.style.display = 'flex';
    }

    let btn_btn_admin_login = document.getElementById('btn-admin-login');
    if (btn_btn_admin_login) btn_btn_admin_login.addEventListener('click', () => {
      const pw = document.getElementById('admin-password').value;
      if (pw === 'Alexnae23#') {
        this.isAdmin = true;
        sessionStorage.setItem('spalatorie_admin', 'true');
        loginPanel.style.display = 'none';
        dashboardPanel.style.display = 'grid';
        this.showToast('Autentificare reușită!', 'success');
      } else {
        this.showToast('Parolă incorectă!', 'error');
      }
    });

    let btn_btn_admin_announce = document.getElementById('btn-admin-announce');
    if (btn_btn_admin_announce) btn_btn_admin_announce.addEventListener('click', () => {
      const text = document.getElementById('admin-announcement-text').value;
      if (text) {
        this.setAnnouncement(text);
        this.showToast('Anunțul a fost publicat!', 'success');
      }
    });

    let btn_btn_admin_clear_announce = document.getElementById('btn-admin-clear-announce');
    if (btn_btn_admin_clear_announce) btn_btn_admin_clear_announce.addEventListener('click', () => {
      this.announcement = null;
      this.saveData();
      this.renderAnnouncement();
      this.showToast('Anunțul a fost șters!', 'success');
    });

    let btn_btn_admin_force_cancel = document.getElementById('btn-admin-force-cancel');
    if (btn_btn_admin_force_cancel) btn_btn_admin_force_cancel.addEventListener('click', () => {
      const userName = document.getElementById('admin-force-cancel-user').value.toLowerCase().trim();
      let found = false;
      this.equipments.forEach(eq => {
        eq.bookings.forEach(b => {
          if (b.status !== 'Anulat' && b.status !== 'Finalizat' && b.user.toLowerCase().trim() === userName) {
            b.status = 'Anulat';
            found = true;
          }
        });
      });
      if (found) {
        this.saveData();
        this.renderDashboard();
        this.showToast('Programare anulată forțat!', 'success');
      } else {
        this.showToast('Nu am găsit nicio programare activă pentru acest nume!', 'error');
      }
    });

    let btn_btn_admin_strike = document.getElementById('btn-admin-strike');
    if (btn_btn_admin_strike) btn_btn_admin_strike.addEventListener('click', () => {
      const userName = document.getElementById('admin-strike-user').value.toLowerCase().trim();
      if (!userName) return;
      const user = this.users.find(u => u.name.toLowerCase().trim() === userName);
      if (user) {
        if (!user.strikeHistory) user.strikeHistory = [];
        const now = new Date();
        const expiry = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours
        
        user.strikeHistory.push({
          date: now.toISOString(),
          expiry: expiry.toISOString()
        });
        
        user.strikes = user.strikeHistory.length;
        
        this.saveData();
        this.showToast(`Avertisment adăugat pentru ${user.name}. Total strikes: ${user.strikes}`, 'success');
        if (user.name === (this.loggedInUser ? this.loggedInUser.name : null)) this.renderProfile();
      } else {
        this.showToast('Utilizatorul nu a fost găsit!', 'error');
      }
    });

    let btn_btn_admin_role = document.getElementById('btn-admin-role');
    if (btn_btn_admin_role) btn_btn_admin_role.addEventListener('click', () => {
      const userName = document.getElementById('admin-role-user').value.toLowerCase().trim();
      const role = document.getElementById('admin-role-select').value;
      if (!userName) return;
      const user = this.users.find(u => u.name.toLowerCase().trim() === userName);
      if (user) {
        user.role = role;
        this.saveData();
        this.showToast(`Rolul lui ${user.name} a fost actualizat la ${role}!`, 'success');
        if (user.name === (this.loggedInUser ? this.loggedInUser.name : null)) {
           this.loggedInUser.role = role;
           this.renderProfile();
        }
      } else {
        this.showToast('Utilizatorul nu a fost găsit!', 'error');
      }
    });
  }

  // 4. Leaderboard Logic
  renderLeaderboard() {
    const container = document.getElementById('leaderboard-container');
    if (!container) return;
    
    // Calculate stats
    const stats = {};
    this.history.forEach(h => {
      if (h.finalStatus === 'Finalizat') {
        if (!stats[h.ap]) stats[h.ap] = 0;
        stats[h.ap]++;
      }
    });

    const sorted = Object.keys(stats).map(ap => ({ ap, count: stats[ap] }))
      .sort((a, b) => b.count - a.count).slice(0, 10);

    container.innerHTML = '';
    
    if (sorted.length === 0) {
      container.innerHTML = `<p style="color:var(--text-muted);">Nicio spălare finalizată încă.</p>`;
      return;
    }

    sorted.forEach((item, index) => {
      let rankClass = '';
      if (index === 0) rankClass = 'rank-1';
      else if (index === 1) rankClass = 'rank-2';
      else if (index === 2) rankClass = 'rank-3';

      container.innerHTML += `
        <div class="leaderboard-item ${rankClass}">
          <div style="display:flex; align-items:center; gap:15px;">
            <div class="rank-badge">${index + 1}</div>
            <strong>Apartamentul ${item.ap}</strong>
          </div>
          <div style="color:var(--text-muted);">
            <strong style="color:var(--text-main);">${item.count}</strong> spălări
          </div>
        </div>
      `;
    });
  }

  // 5. Report Broken
  setupReportBroken() {
    const reportModal = document.getElementById('report-modal');
    const closeBtn = document.getElementById('close-report-modal');
    const btnOpen = document.getElementById('btn-open-report');
    const btnConfirm = document.getElementById('btn-confirm-report');

    if (btnOpen) {
      btnOpen.addEventListener('click', () => {
        document.getElementById('action-modal').classList.remove('active');
        reportModal.classList.add('active');
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        reportModal.classList.remove('active');
      });
    }

    if (btnConfirm) {
      btnConfirm.addEventListener('click', () => {
        const reason = document.getElementById('report-reason').value;
        if (this.currentActionMachine) {
          this.currentActionMachine.type = 'dryer'; // Hacky way to mark as broken using existing logic
          this.currentActionMachine.status = 'Indisponibil momentan';
          this.saveData();
          this.renderDashboard();
          this.showToast('Echipamentul a fost marcat ca defect și adminul a fost alertat!', 'success');
          reportModal.classList.remove('active');
        }
      });
    }
  }
  // ===== V4.0 FEATURES =====

  checkAuth() {
    const savedUser = localStorage.getItem('spalatorie_logged_in');
    if (savedUser) {
      this.loggedInUser = JSON.parse(savedUser);
      // Check if user has 3 strikes
      const dbUser = this.users.find(u => u.name === this.loggedInUser.name);
      if (dbUser && dbUser.strikes >= 3) {
        this.showToast('Contul tău a fost blocat temporar de administrator!', 'error');
        this.loggedInUser = null;
        localStorage.removeItem('spalatorie_logged_in');
      }
    }

    if (this.loggedInUser) {
      document.getElementById('auth-screen').style.display = 'none';
      document.getElementById('app-container').style.display = 'flex';
      this.renderChat();
    } else {
      document.getElementById('auth-screen').style.display = 'flex';
      document.getElementById('app-container').style.display = 'none';
    }
  }

  setupAuth() {
    const btnLogin = document.getElementById('btn-login');
    const btnRegister = document.getElementById('btn-register');
    const linkRegister = document.getElementById('link-to-register');
    const linkLogin = document.getElementById('link-to-login');

    if (linkRegister) {
      linkRegister.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('login-form-container').style.display = 'none';
        document.getElementById('reset-form-container').style.display = 'none';
        document.getElementById('register-form-container').style.display = 'block';
      });
    }

    document.querySelectorAll('.open-gdpr').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        alert("POLITICA GDPR & CONFIDENȚIALITATE\n\nDatele dvs. (Nume, Apartament) sunt folosite exclusiv pentru buna funcționare a aplicației Spălătoria UB și pentru trasabilitatea programărilor.\n\nParolele sunt stocate în mod securizat pe platformă.\n\nPrin folosirea acestei aplicații, vă dați acordul pentru procesarea și afișarea publică a acestor date în cadrul aplicației.");
      });
    });

    if (linkLogin) {
      linkLogin.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('register-form-container').style.display = 'none';
        document.getElementById('reset-form-container').style.display = 'none';
        document.getElementById('login-form-container').style.display = 'block';
      });
    }

    const linkReset = document.getElementById('link-to-reset');
    if (linkReset) {
      linkReset.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('login-form-container').style.display = 'none';
        document.getElementById('register-form-container').style.display = 'none';
        document.getElementById('reset-form-container').style.display = 'block';
      });
    }

    const linkLoginFromReset = document.getElementById('link-to-login-from-reset');
    if (linkLoginFromReset) {
      linkLoginFromReset.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('reset-form-container').style.display = 'none';
        document.getElementById('login-form-container').style.display = 'block';
      });
    }

    const btnReset = document.getElementById('btn-reset-pw');
    if (btnReset) {
      btnReset.addEventListener('click', () => {
        const name = document.getElementById('reset-name').value.trim();
        const ap = document.getElementById('reset-ap').value;
        const newPw = document.getElementById('reset-password').value;

        if (!name || !ap || !newPw) {
          this.showToast('Completează toate câmpurile!', 'error');
          return;
        }

        const user = this.users.find(u => u.name.toLowerCase() === name.toLowerCase() && String(u.ap) === String(ap));
        if (user) {
          user.pw = newPw;
          this.saveData();
          this.showToast('Parola a fost resetată cu succes! Te poți loga.', 'success');
          document.getElementById('reset-form-container').style.display = 'none';
          document.getElementById('login-form-container').style.display = 'block';
        } else {
          this.showToast('Date incorecte! Nu am găsit un cont cu acest nume și apartament.', 'error');
        }
      });
    }

    if (btnRegister) {
      btnRegister.addEventListener('click', () => {
        const name = document.getElementById('reg-name').value.trim();
        const scara = document.getElementById('reg-scara').value;
        const ap = document.getElementById('reg-ap').value;
        const pw = document.getElementById('reg-password').value;

        if (!name || !ap || !pw) {
          this.showToast('Completează toate câmpurile!', 'error');
          return;
        }

        if (scara === '2') {
          this.showToast('Ne pare rău, dar momentan doar locatarii din Scara 1 au dreptul să își creeze cont și să folosească spălătoria.', 'error');
          return;
        }

        const exists = this.users.find(u => u.name.toLowerCase() === name.toLowerCase());
        if (exists) {
          this.showToast('Acest nume este deja folosit!', 'error');
          return;
        }

        let finalName = name;
        let role = 'user';
        if (name.toLowerCase() === 'alexandru nae' || name.toLowerCase() === 'alexander.dev') {
          finalName = 'alexander.dev';
          role = 'developer';
        }

        const newUser = { name: finalName, ap, pw, strikes: 0, role: role, washes: 0, badges: [] };
        this.users.push(newUser);
        this.saveData();
        this.loggedInUser = newUser;
        localStorage.setItem('spalatorie_logged_in', JSON.stringify(newUser));
        this.checkAuth();
        this.showToast('Cont creat cu succes!', 'success');
      });
    }

    if (btnLogin) {
      btnLogin.addEventListener('click', () => {
        const name = document.getElementById('auth-name').value.trim();
        const pw = document.getElementById('auth-password').value;

        const user = this.users.find(u => u.name.toLowerCase() === name.toLowerCase() && u.pw === pw);
        if (user) {
          this.loggedInUser = user;
          localStorage.setItem('spalatorie_logged_in', JSON.stringify(user));
          this.checkAuth();
          this.setupAdminPanel(); // Refresh admin panel visibility based on role
          this.showToast('Autentificare reușită!', 'success');
        } else {
          this.showToast('Nume sau parolă incorecte!', 'error');
        }
      });
    }
  }

  setupChat() {
    const btnSend = document.getElementById('btn-send-chat');
    const input = document.getElementById('chat-input');
    
    if (btnSend && input) {
      const sendMsg = () => {
        const val = input.value.trim();
        if (!val || !this.loggedInUser) return;
        
        this.chatMessages.push({
          id: 'msg_' + new Date().getTime(),
          author: this.loggedInUser.name,
          ap: this.loggedInUser.ap,
          text: val,
          timestamp: new Date().getTime(),
          role: this.loggedInUser.role || 'user',
          likes: []
        });
        
        // Keep last 50 messages
        if (this.chatMessages.length > 50) this.chatMessages.shift();
        
        input.value = '';
        this.saveData();
        this.renderChat();
      };

      btnSend.addEventListener('click', sendMsg);
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMsg();
      });
    }
  }

  renderChat() {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    container.innerHTML = '';
    
    if (this.chatMessages.length === 0) {
      container.innerHTML = `<p style="text-align:center; color:var(--text-muted); margin-top:20px;">Niciun mesaj pe avizier încă.</p>`;
      return;
    }

    this.chatMessages.forEach(msg => {
      const isMine = this.loggedInUser && msg.author === this.loggedInUser.name;
      const date = new Date(msg.timestamp);
      const timeStr = String(date.getHours()).padStart(2,'0') + ':' + String(date.getMinutes()).padStart(2,'0');
      
      let badgeHtml = '';
      if (msg.role === 'developer') badgeHtml = `<span style="background: #FF00FF; color: #FFF; padding: 2px 6px; border-radius: 4px; font-size: 0.6rem; margin-left: 5px;">Developer</span>`;
      else if (msg.role === 'admin') badgeHtml = `<span style="background: #EF4444; color: #FFF; padding: 2px 6px; border-radius: 4px; font-size: 0.6rem; margin-left: 5px;">Administrator Cămin</span>`;
      else if (msg.role === 'sef') badgeHtml = `<span style="background: #8B5CF6; color: #FFF; padding: 2px 6px; border-radius: 4px; font-size: 0.6rem; margin-left: 5px;">Șef de Cămin</span>`;

      const hasLiked = this.loggedInUser && msg.likes && msg.likes.includes(this.loggedInUser.name);
      const likesCount = (msg.likes || []).length;
      
      let deleteBtnHtml = '';
      if (this.loggedInUser && (this.loggedInUser.role === 'developer' || this.loggedInUser.role === 'admin' || this.loggedInUser.role === 'sef' || isMine)) {
        deleteBtnHtml = `<ion-icon name="trash-outline" class="chat-delete-btn" data-id="${msg.id}" style="cursor: pointer; font-size: 0.9rem; margin-left: 10px; color: #EF4444;"></ion-icon>`;
      }

      const bubble = document.createElement('div');
      bubble.style.display = 'flex';
      bubble.style.flexDirection = 'column';
      bubble.style.maxWidth = '80%';
      bubble.style.alignSelf = isMine ? 'flex-end' : 'flex-start';
      bubble.style.background = isMine ? 'var(--primary-color)' : 'rgba(255,255,255,0.1)';
      bubble.style.color = isMine ? '#000' : 'var(--text-main)';
      bubble.style.padding = '8px 12px';
      bubble.style.borderRadius = '12px';
      if (isMine) bubble.style.borderBottomRightRadius = '2px';
      else bubble.style.borderBottomLeftRadius = '2px';
      
      bubble.innerHTML = `
        <span style="font-size:0.7rem; font-weight:bold; opacity:0.8; margin-bottom:3px; display:flex; align-items:center;">
          ${msg.author} (Ap. ${msg.ap}) ${badgeHtml}
        </span>
        <span style="font-size:0.95rem;">${msg.text}</span>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px;">
          <div style="font-size:0.8rem; display:flex; align-items:center; gap:5px; cursor:pointer;" class="chat-like-btn" data-id="${msg.id}">
            <ion-icon name="${hasLiked ? 'heart' : 'heart-outline'}" style="color: ${hasLiked ? '#EF4444' : 'inherit'};"></ion-icon> <span>${likesCount > 0 ? likesCount : ''}</span>
          </div>
          <div style="display:flex; align-items:center;">
            <span style="font-size:0.6rem; opacity:0.7;">${timeStr}</span>
            ${deleteBtnHtml}
          </div>
        </div>
      `;
      container.appendChild(bubble);
    });
    
    // Add event listeners for Likes and Deletes
    container.querySelectorAll('.chat-like-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        if (!this.loggedInUser) return;
        const id = e.currentTarget.getAttribute('data-id');
        const msg = this.chatMessages.find(m => m.id === id);
        if (msg) {
          if (!msg.likes) msg.likes = [];
          if (msg.likes.includes(this.loggedInUser.name)) {
            msg.likes = msg.likes.filter(n => n !== this.loggedInUser.name);
          } else {
            msg.likes.push(this.loggedInUser.name);
          }
          this.saveData();
          this.renderChat();
        }
      });
    });

    container.querySelectorAll('.chat-delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        if (!confirm('Ești sigur că vrei să ștergi acest mesaj?')) return;
        const id = e.currentTarget.getAttribute('data-id');
        this.chatMessages = this.chatMessages.filter(m => m.id !== id);
        this.saveData();
        this.renderChat();
      });
    });

    container.scrollTop = container.scrollHeight;
  }



  // ===== V5.0 FEATURES (Profile & Push) =====
  setupProfile() {
    const btnNotif = document.getElementById('btn-enable-notifications');
    if (btnNotif) {
      btnNotif.addEventListener('click', () => {
        if (!('Notification' in window)) {
          this.showToast('Browserul tău nu suportă notificări!', 'error');
        } else if (Notification.permission === 'granted') {
          this.showToast('Notificările sunt deja active!', 'success');
        } else if (Notification.permission === 'denied') {
          this.showToast('Ai blocat notificările din browser! Modifică permisiunile din setările site-ului.', 'error');
        } else {
          Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
              this.showToast('Ai activat notificările!', 'success');
            } else {
              this.showToast('Notificările au fost respinse.', 'error');
            }
          });
        }
      });
    }

    const btnChangePw = document.getElementById('btn-change-pw-profile');
    if (btnChangePw) {
      btnChangePw.addEventListener('click', () => {
        if (!this.loggedInUser) return;
        
        const oldPw = prompt('Introdu parola actuală a contului pentru verificare:');
        if (oldPw === null) return;
        if (oldPw !== this.loggedInUser.pw) {
           this.showToast('Parola actuală este incorectă!', 'error');
           return;
        }
        
        const newPw = prompt('Introdu noua parolă dorită:');
        if (!newPw) return;
        if (newPw.length < 4) {
           this.showToast('Noua parolă trebuie să aibă minim 4 caractere!', 'error');
           return;
        }
        
        // Update password
        this.loggedInUser.pw = newPw;
        const user = this.users.find(u => u.name === this.loggedInUser.name);
        if (user) {
           user.pw = newPw;
        }
        
        // Also update the active session
        localStorage.setItem('spalatorie_logged_in', JSON.stringify(this.loggedInUser));
        
        this.saveData();
        this.showToast('Parola a fost schimbată cu succes!', 'success');
      });
    }

    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
      btnLogout.addEventListener('click', () => {
        if (!confirm('Ești sigur că vrei să te deconectezi?')) return;
        localStorage.removeItem('spalatorie_logged_in');
        sessionStorage.removeItem('spalatorie_admin');
        this.loggedInUser = null;
        this.isAdmin = false;
        
        // Hide admin view from nav
        document.getElementById('nav-admin').style.display = 'none';
        
        // Hide app and show auth screen
        document.getElementById('app-container').style.display = 'none';
        document.getElementById('auth-screen').style.display = 'flex';
        document.getElementById('auth-name').value = '';
        document.getElementById('auth-password').value = '';
        
        this.showToast('Te-ai deconectat cu succes.', 'success');
      });
    }
  }

  renderProfile() {
    if (!this.loggedInUser) return;
    
    // Find the latest user stats from users array
    const user = this.users.find(u => u.name === this.loggedInUser.name) || this.loggedInUser;

    document.getElementById('profile-name-display').textContent = user.name;
    
    let roleName = 'Utilizator Normal';
    if (user.role === 'developer') roleName = 'Developer';
    else if (user.role === 'admin') roleName = 'Administrator Cămin';
    else if (user.role === 'sef') roleName = 'Șef de Cămin';

    document.getElementById('profile-role-display').textContent = roleName;
    document.getElementById('profile-washes').textContent = user.washes || 0;
    document.getElementById('profile-strikes').textContent = user.strikes || 0;

    const badgesContainer = document.getElementById('profile-badges');
    badgesContainer.innerHTML = '';
    
    let badges = [];
    if (user.strikes === 0 && (user.washes || 0) > 0) {
      badges.push({ icon: '🌟', title: 'Cetățean Model', desc: 'Niciun strike' });
    }
    if ((user.washes || 0) >= 10) {
      badges.push({ icon: '💧', title: 'Spălător Pasionat', desc: 'Peste 10 spălări' });
    }

    if (badges.length === 0) {
      badgesContainer.innerHTML = '<p style="color: var(--text-muted); width: 100%; text-align: center; font-size: 0.9rem;">Nu ai nicio insignă încă.</p>';
    } else {
      badges.forEach(b => {
        badgesContainer.innerHTML += `
          <div style="background: rgba(255, 179, 0, 0.1); border: 1px solid rgba(255, 179, 0, 0.3); padding: 10px; border-radius: 10px; display: flex; flex-direction: column; align-items: center; width: 100px; text-align: center;">
            <span style="font-size: 2rem;">${b.icon}</span>
            <span style="font-size: 0.8rem; font-weight: bold; margin-top: 5px; color: var(--primary-color);">${b.title}</span>
          </div>
        `;
      });
    }
  }

  checkPushNotifications() {
    if (!this.loggedInUser || !('Notification' in window) || Notification.permission !== 'granted') return;
    
    const now = new Date().getTime();
    this.equipments.forEach(eq => {
      eq.bookings.forEach(b => {
        if (b.user === this.loggedInUser.name && b.status !== 'Anulat' && b.status !== 'Finalizat') {
          const endTimestamp = this.parseDateTime(b.date, b.endTime).getTime();
          const diffMs = endTimestamp - now;
          // If exactly between 9 and 10 minutes left
          if (diffMs > 9 * 60 * 1000 && diffMs <= 10 * 60 * 1000) {
            new Notification('Spălătoria UB', {
              body: `Programarea ta la ${eq.name} se termină în 10 minute! Te rugăm să te pregătești să eliberezi mașina.`,
              icon: 'ub_washer_logo.png'
            });
          }
        }
      });
    });
  }
}

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
  window.app = new SpalatorieApp();
});

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
    this.uiInitialized = false;
    
    try {
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
      this.setupDelegations();
      
      if (this.isLightMode) document.body.classList.add('light-theme');
      this.applyTranslations();
      this.setupThemeAndLang();
      
      this.setupAuth();
      this.checkAuth();
    
      setTimeout(() => {
        const ls = document.getElementById('loading-screen');
        if (ls) ls.classList.add('hidden');
      }, 800);

      this.isUserActive = true;
      this.lastActivityTime = Date.now();

      const recordActivity = () => {
        this.lastActivityTime = Date.now();
        if (!this.isUserActive) {
          this.isUserActive = true;
          this.triggerNextTick(1000);
        }
      };

      document.addEventListener('mousemove', recordActivity);
      document.addEventListener('keydown', recordActivity);
      document.addEventListener('touchstart', recordActivity);
      document.addEventListener('click', recordActivity);

      this.triggerNextTick = (delay) => {
        if (this.pollingTimeout) clearTimeout(this.pollingTimeout);
        
        this.pollingTimeout = setTimeout(async () => {
          if (document.visibilityState === 'hidden') {
            this.triggerNextTick(30000);
            return;
          }

          if (Date.now() - this.lastActivityTime > 2 * 60 * 1000) {
            this.isUserActive = false;
          }

          const nextDelay = this.isUserActive ? 15000 : 45000;
          
          const dataChanged = await this.loadData();
          if (dataChanged && this.loggedInUser) {
            this.renderDashboard();
            this.renderChat();
            if (this.currentWeeklyDate) this.renderWeeklySchedule(this.currentWeeklyDate);
            if (this.isAdmin) this.renderAdminBookings();
          }

          this.triggerNextTick(nextDelay);
        }, delay);
      };

      this.triggerNextTick(15000);
      
      setInterval(() => {
        this.tickTimers();
        this.checkMidnightRefresh();
      }, 1000);

      setInterval(() => this.checkUpcomingAnnouncements(), 10000);

      this.setupProfile();
      setInterval(() => this.checkPushNotifications(), 60000);
    } catch (err) {
      alert("EROARE INIT: " + err.message + "\n" + err.stack);
      console.error("Init Error:", err);
      setTimeout(() => {
        const ls = document.getElementById('loading-screen');
        if (ls) ls.classList.add('hidden');
      }, 500);
    }
  }

  // Curățare securizată împotriva atacurilor XSS în chat
  sanitizeHTML(str) {
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
  }

  // Monitorizare schimbare zi calendaristică la miezul nopții pentru tab-uri live
  checkMidnightRefresh() {
    const todayStr = this.getLocalDateStr(new Date());
    if (this.lastCheckedDate && this.lastCheckedDate !== todayStr) {
      this.lastCheckedDate = todayStr; // Actualizare corecta inainte de generare
      if (this.loggedInUser) {
        setTimeout(() => this.generateWeekTabs(), 0);
      }
    } else {
      this.lastCheckedDate = todayStr; // Initializare la prima executie
    }
  }

  parseDateTime(dateStr, timeStr, applyOvernightFix = true) {
    if (!dateStr || !timeStr) return new Date();
    
    const dateParts = dateStr.includes('-') ? dateStr.split('-') : dateStr.split('/');
    const [hour, minute] = timeStr.split(':');
    
    let parsedDate;
    if (dateParts[0].length === 4) {
      parsedDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2], hour, minute);
    } else {
      parsedDate = new Date(dateParts[2], dateParts[1] - 1, dateParts[0], hour, minute);
    }
    
    if (isNaN(parsedDate.getTime())) {
      console.warn("⚠️ Data invalida detectata:", dateStr, timeStr);
      return new Date();
    }
    
    return parsedDate;
  }

  getLocalDateStr(d) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

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

  showSuccessAnimation(text = 'Programare confirmată!') {
    const overlay = document.createElement('div');
    overlay.className = 'success-overlay';
    overlay.innerHTML = `
      <div class="success-checkmark">
        <ion-icon name="checkmark-outline"></ion-icon>
      </div>
      <p>${this.sanitizeHTML(text)}</p>
    `;
    document.body.appendChild(overlay);
    this.playNotificationSound();
    
    setTimeout(() => {
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity 0.4s ease';
      setTimeout(() => overlay.remove(), 400);
    }, 1500);
  }

  unlockAudio() {
    const unlock = () => {
      this.playNotificationSound(true);
      document.removeEventListener('click', unlock);
      document.removeEventListener('touchstart', unlock);
    };
    document.addEventListener('click', unlock);
    document.addEventListener('touchstart', unlock);
  }

  playNotificationSound(silent = false) {
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

      playTone(659.25, 0, 0.6);
      playTone(523.25, 0.4, 0.8);
    } catch (e) {
      console.log('Audio play failed', e);
    }
  }

  setAnnouncement(message) {
    this.announcement = {
      message: message,
      timestamp: new Date().getTime()
    };
    this.playNotificationSound();
    this.saveData();
    this.renderDashboard();
  }

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
          
          let serverBookingsCount = 0;
          if (data.equipments) {
            data.equipments.forEach(eq => serverBookingsCount += (eq.bookings ? eq.bookings.length : 0));
          }
          
          let localBookingsCount = 0;
          let localEq = [];
          try {
            localEq = JSON.parse(localStorage.getItem('spalatorie_equipments') || '[]');
            localEq.forEach(eq => localBookingsCount += (eq.bookings ? eq.bookings.length : 0));
          } catch(e) {}

          if (serverBookingsCount === 0 && localBookingsCount > 0) {
            console.warn("Vercel wipe detected: Server has 0 bookings, local has " + localBookingsCount);
            this.parseEquipments(localEq);
            if (this.isAdmin) {
              console.log("Admin detected, restoring server state...");
              setTimeout(() => this.saveData(), 2000);
            }
          } else if (data.equipments) {
            this.parseEquipments(data.equipments);
          } else {
            this.loadFromLocalStorage();
          }
          if (data.history) this.history = data.history;
          if (data.users) {
            this.users = data.users;
            // Sincronizare dinamică a profilului local cu serverul în caz de modificări administrative
            if (this.loggedInUser) {
              const currentMe = this.users.find(u => u.name === this.loggedInUser.name);
              if (currentMe) {
                this.loggedInUser = { ...currentMe };
                localStorage.setItem('spalatorie_logged_in', JSON.stringify(this.loggedInUser));
                this.isAdmin = ['admin', 'developer', 'sef'].includes(this.loggedInUser.role);
              }
            }
          }
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
    try {
      return JSON.stringify({
        equipments: JSON.parse(localStorage.getItem('spalatorie_equipments') || 'null'),
        history: JSON.parse(localStorage.getItem('spalatorie_history') || 'null'),
        users: JSON.parse(localStorage.getItem('spalatorie_users') || 'null'),
        chatMessages: JSON.parse(localStorage.getItem('spalatorie_chat') || 'null'),
        announcement: JSON.parse(localStorage.getItem('spalatorie_announcement') || 'null')
      });
    } catch(e) {
      return '{"equipments":null}';
    }
  }

  loadFromLocalStorage() {
    try {
      const savedEq = localStorage.getItem('spalatorie_equipments');
      const savedHist = localStorage.getItem('spalatorie_history');
      const savedUsers = localStorage.getItem('spalatorie_users');
      const savedChat = localStorage.getItem('spalatorie_chat');
      if (savedEq) this.parseEquipments(JSON.parse(savedEq) || []);
      if (savedHist) this.history = JSON.parse(savedHist) || [];
      if (savedUsers) this.users = JSON.parse(savedUsers) || [];
      if (savedChat) this.chatMessages = JSON.parse(savedChat) || [];
      const savedAnn = localStorage.getItem('spalatorie_announcement');
      if (savedAnn) this.announcement = JSON.parse(savedAnn);
    } catch (e) {
      console.warn("Eroare la citirea din local storage:", e);
    }
  }

  parseEquipments(parsedEq) {
    const namesMap = {
      'washer-1': 'Mașină Ușă',
      'washer-2': 'Mașină Mijloc',
      'washer-3': 'Mașină Geam',
      'dryer-1': 'Uscător Ușă',
      'dryer-2': 'Uscător Geam'
    };

    this.equipments = parsedEq.map(eq => {
      if (!eq.bookings) eq.bookings = [];
      eq.name = namesMap[eq.id] || eq.name;
      return eq;
    });
  }

  async saveData() {
    if (this.history && this.history.length > 200) {
      this.history = this.history.slice(0, 200);
    }
    if (this.chatMessages && this.chatMessages.length > 50) {
      this.chatMessages = this.chatMessages.slice(-50);
    }

    try {
      localStorage.setItem('spalatorie_equipments', JSON.stringify(this.equipments));
      localStorage.setItem('spalatorie_history', JSON.stringify(this.history));
      localStorage.setItem('spalatorie_users', JSON.stringify(this.users));
      localStorage.setItem('spalatorie_chat', JSON.stringify(this.chatMessages));
      localStorage.setItem('spalatorie_announcement', JSON.stringify(this.announcement));
    } catch (quotaError) {
      console.error("LocalStorage Quota Exceeded:", quotaError);
    }

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
        this.lastRawData = payload;
        const result = await res.json();
        if (result.status === 'success') {
          this.updateConnectionStatus(true);
        } else {
          this.updateConnectionStatus(false);
          this.showToast('Eroare server: ' + (result.message || 'necunoscută'), 'error');
        }
      } else {
        this.updateConnectionStatus(false);
      }
    } catch (e) {
      this.updateConnectionStatus(false);
    }
  }

  setupNavigation() {
    const navLinks = document.querySelectorAll('.nav-links li');
    const sections = document.querySelectorAll('.view-section');

    navLinks.forEach(link => {
      link.addEventListener('click', () => {
        if (!this.loggedInUser) return;
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

        const sidebar = document.querySelector('.sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        if (sidebar) sidebar.classList.remove('open');
        if (overlay) overlay.classList.remove('active');
      });
    });

    const btnMenu = document.getElementById('btn-mobile-menu');
    const overlay = document.getElementById('sidebar-overlay');
    const sidebar = document.querySelector('.sidebar');

    if (btnMenu && sidebar && overlay) {
      btnMenu.addEventListener('click', () => {
        sidebar.classList.add('open');
        overlay.classList.add('active');
      });
      overlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
      });
    }
  }

  setupBookingForm() {
    const form = document.getElementById('booking-form');
    if (!form) return;
    
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      if (!this.loggedInUser) {
        this.showToast('Trebuie să fii logat pentru a programa!', 'error');
        return;
      }

      const liveUser = this.users.find(u => u.name === this.loggedInUser.name);
      if (liveUser && liveUser.strikes >= 3) {
        this.showToast('Contul tău are 3 avertismente! Nu poți face programări.', 'error');
        return;
      }

      const nume = this.loggedInUser.name;
      const ap = this.loggedInUser.ap;
      const pinRezervare = this.loggedInUser.pw;

      const eqId = document.getElementById('echipament').value;
      const data = document.getElementById('data-rezervare').value;
      const oraInceput = document.getElementById('ora-inceput').value;
      const oraSfarsit = document.getElementById('ora-sfarsit').value;

      const eq = this.equipments.find(e => e.id === eqId);
      if (!eq) return;

      if (eq.isBroken || eq.status === 'Indisponibil momentan') {
        this.showToast('Acest echipament este defect / indisponibil!', 'error');
        return;
      }

      const now = new Date().getTime();
      const newStart = this.parseDateTime(data, oraInceput).getTime();
      let newEnd = this.parseDateTime(data, oraSfarsit).getTime();
      
      if (newEnd <= newStart) {
        newEnd += 24 * 60 * 60 * 1000;
      }
      
      if (newEnd - newStart < 30 * 60 * 1000) {
        this.showToast('Durata minimă este de 30 de minute!', 'error');
        return;
      }
      
      if (newStart < now - (5 * 60 * 1000)) {
        this.showToast('Nu poți rezerva în trecut!', 'error');
        return;
      }
      
      if (newEnd - newStart > 4 * 60 * 60 * 1000) {
        this.showToast('Durata maximă este de 4 ore!', 'error');
        return;
      }

      const submitBtn = document.getElementById('btn-submit-booking');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Se salvează...';

      await this.loadData();
      
      const freshEq = this.equipments.find(e => e.id === eqId);
      if (freshEq) {
        const freshOverlap = freshEq.bookings.some(b => {
          if (b.status === 'Anulat' || b.status === 'Finalizat' || b.status === 'Liber') return false;
          const bStart = this.parseDateTime(b.date, b.startTime).getTime();
          let bEnd = this.parseDateTime(b.date, b.endTime).getTime();
          if (bEnd <= bStart) bEnd += 24 * 60 * 60 * 1000;
          return (newStart < bEnd && newEnd > bStart);
        });

        if (freshOverlap) {
          this.showToast('Echipamentul a fost rezervat între timp de altcineva!', 'error');
          submitBtn.disabled = false;
          submitBtn.textContent = 'Confirmă Programarea';
          return;
        }

        const booking = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
          user: nume,
          ap: ap,
          date: data,
          startTime: oraInceput,
          endTime: oraSfarsit,
          status: 'Programat',
          pin: pinRezervare
        };

        freshEq.bookings.push(booking);
      }

      await this.saveData();
      
      submitBtn.disabled = false;
      submitBtn.textContent = 'Confirmă Programarea';
      
      this.showSuccessAnimation('Programare confirmată cu succes!');
      form.reset();
      
      setTimeout(() => {
        const dashLink = document.querySelector('[data-view="dashboard"]');
        if (dashLink) dashLink.click();
        this.generateWeekTabs();
      }, 1600);
    });
  }

  setupCancelForm() {
    const btnSearch = document.getElementById('btn-search-cancel');
    const resultsContainer = document.getElementById('cancel-results');
    if (!btnSearch || !resultsContainer) return;

    btnSearch.addEventListener('click', () => {
      if (!this.loggedInUser) return;

      const numeExact = this.loggedInUser.name.toLowerCase().trim();
      const apExact = this.loggedInUser.ap.toString().trim();
      const now = new Date().getTime();
      let foundBookings = [];

      this.equipments.forEach(eq => {
        eq.bookings.forEach(b => {
          const userStr = (b.user || '').trim().toLowerCase();
          const matchesUser = userStr === numeExact; // Securizare prin potrivire exactă
          const matchesAp = b.ap && b.ap.toString().trim() === apExact;
          
          if (matchesUser && matchesAp && b.status !== 'Anulat' && b.status !== 'Finalizat' && b.status !== 'Liber') {
            const bStart = this.parseDateTime(b.date, b.startTime).getTime();
            let bEnd = this.parseDateTime(b.date, b.endTime).getTime();
            if (bEnd <= bStart) bEnd += 24 * 60 * 60 * 1000;
            if (bEnd > now) {
              foundBookings.push({ eq, booking: b });
            }
          }
        });
      });

      resultsContainer.innerHTML = '';

      if (foundBookings.length === 0) {
        resultsContainer.innerHTML = `<div class="info-row" style="color:var(--text-muted);">Nu am găsit nicio programare activă proprie.</div>`;
        return;
      }

      foundBookings.forEach(({ eq, booking }) => {
        const item = document.createElement('div');
        item.style = 'padding:10px; background:rgba(0,0,0,0.3); border-radius:8px; border:1px solid var(--glass-border); display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;';
        item.innerHTML = `
          <div>
            <div style="font-weight:bold; color:var(--primary-color);">${this.sanitizeHTML(eq.name)}</div>
            <div style="font-size:0.85rem; color:#FFF;">${booking.date} &bull; ${booking.startTime} - ${booking.endTime}</div>
          </div>
          <div style="display:flex; gap:5px;">
            <button class="btn-primary btn-cancel-action" data-eq="${eq.id}" data-bid="${booking.id}" style="background:#ff4d4d; border:none; padding:5px 10px; font-size:0.85rem; border-radius:5px; width:auto;">Anulează</button>
            <button class="btn-primary btn-trade-action" data-eq="${eq.id}" data-bid="${booking.id}" style="background:#8B5CF6; border:none; padding:5px 10px; font-size:0.85rem; border-radius:5px; width:auto;">La schimb</button>
          </div>
        `;

        

        resultsContainer.appendChild(item);
      });
    });
  }

  getStatusColor(status) {
    switch (status) {
      case 'Liber': return 'var(--status-liber)';
      case 'Ocupat': return 'var(--status-ocupat)';
      case 'Anulat': return 'var(--status-anulat)';
      case 'Donat către': return 'var(--status-donat)';
      default: return 'var(--text-muted)';
    }
  }

  updateStats() {
    const now = new Date().getTime();
    const todayStr = this.getLocalDateStr(new Date());
    
    let libere = 0, ocupate = 0, programariAzi = 0;
    const locatariSet = new Set();

    this.equipments.forEach(eq => {
      if (eq.type === 'dryer') return;

      let isOccupied = false;
      eq.bookings.forEach(b => {
        if (!b.status || b.status === 'Anulat' || b.status === 'Finalizat' || b.status === 'Liber') return;
        
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

  renderDashboard() {
    const washersContainer = document.getElementById('washers-container');
    const dryersContainer = document.getElementById('dryers-container');
    if (!washersContainer || !dryersContainer) return;
    
    washersContainer.innerHTML = '';
    dryersContainer.innerHTML = '';

    this.renderAnnouncement();
    const now = new Date().getTime();
    const todayStr = this.getLocalDateStr(new Date());

    this.equipments.forEach(eq => {
      eq.bookings.sort((a, b) => this.parseDateTime(a.date, a.startTime).getTime() - this.parseDateTime(b.date, b.startTime).getTime());
      
      let currentActive = null;
      let upcoming = [];

      eq.bookings.forEach(b => {
        if (b.status === 'Anulat' || b.status === 'Finalizat' || b.status === 'Liber') return;
        
        const bStart = this.parseDateTime(b.date, b.startTime).getTime();
        let bEnd = this.parseDateTime(b.date, b.endTime).getTime();
        if (bEnd <= bStart) bEnd += 24 * 60 * 60 * 1000;
        
        if (now >= bStart && now <= bEnd) {
          currentActive = b;
        } else if (bStart > now && b.date === todayStr) {
          upcoming.push(b);
        }
      });

      let statusToDisplay = 'Liber';
      if (eq.isBroken || eq.status === 'Indisponibil momentan') {
        statusToDisplay = 'Indisponibil momentan';
      } else if (currentActive) {
        statusToDisplay = currentActive.status === 'Donat către' ? 'Donat către' : 'Ocupat';
      } else if (upcoming.length > 0) {
        statusToDisplay = 'Rezervat (Viitor)';
      }

      eq.status = statusToDisplay;

      const card = document.createElement('div');
      card.className = 'machine-card';
      card.setAttribute('data-eqid', eq.id);
      
      let badgeColor = this.getStatusColor(statusToDisplay);
      if (statusToDisplay === 'Rezervat (Viitor)') badgeColor = '#3B82F6';
      if (statusToDisplay === 'Indisponibil momentan') badgeColor = '#6B7280';
      card.style.setProperty('--status-color', badgeColor);
      
      let userInfo = '';
      const washerSvg = `<svg width="40" height="40" viewBox="0 0 24 24" fill="#FFB300"><path d="M19 4H5C3.89543 4 3 4.89543 3 6V20C3 21.1046 3.89543 22 5 22H19C20.1046 22 21 21.1046 21 20V6C21 4.89543 20.1046 4 19 4Z" stroke="#FFB300" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="15" r="4" fill="#121212" stroke="#121212" stroke-width="2"/><circle cx="12" cy="15" r="2" fill="#FFB300"/></svg>`;
      const dryerSvg = `<svg width="40" height="40" viewBox="0 0 24 24" fill="#FF6B00"><path d="M19 4H5C3.89543 4 3 4.89543 3 6V20C3 21.1046 3.89543 22 5 22H19C20.1046 22 21 21.1046 21 20V6C21 4.89543 20.1046 4 19 4Z" stroke="#FF6B00" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="14" r="5" fill="none" stroke="#121212" stroke-width="2" stroke-dasharray="4 4"/></svg>`;
      
      const iconToUse = eq.type === 'washer' ? washerSvg : dryerSvg;
      const pulseClass = currentActive ? 'active-pulse' : '';

      if (currentActive) {
        let activeEndTimestamp = this.parseDateTime(currentActive.date, currentActive.endTime).getTime();
        const activeStartTimestamp = this.parseDateTime(currentActive.date, currentActive.startTime).getTime();
        if (activeEndTimestamp <= activeStartTimestamp) activeEndTimestamp += 24 * 60 * 60 * 1000;

        let nextPersonHtml = '';
        if (upcoming.length > 0) {
          const next = upcoming[0];
          nextPersonHtml = `
            <div class="info-row" style="margin-top:8px; color:var(--primary-color); font-size: 0.95rem;">
              <ion-icon name="arrow-forward-outline"></ion-icon> <strong>Următorul:</strong> ${this.sanitizeHTML(next.user)} (Ap. ${next.ap}) de la ${next.startTime}
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
            <div class="info-row"><ion-icon name="person-outline"></ion-icon> <span class="info-value">${this.sanitizeHTML(currentActive.user)} (Ap. ${currentActive.ap})</span></div>
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
      } else if (eq.isBroken || eq.status === 'Indisponibil momentan') {
        userInfo += `<div class="info-row" style="margin-bottom:10px; color: var(--status-ocupat);"><ion-icon name="close-circle-outline"></ion-icon> <span class="info-value">Echipament defect / Indisponibil</span></div>`;
      } else if (upcoming.length > 0) {
        userInfo += `<div class="info-row" style="margin-bottom:10px; color: #3B82F6;"><ion-icon name="calendar-outline"></ion-icon> <span class="info-value">Liber, dar rezervat la ${upcoming[0].startTime}</span></div>`;
      } else {
        userInfo += `<div class="info-row" style="margin-bottom:10px;"><ion-icon name="checkmark-circle-outline"></ion-icon> <span class="info-value">Disponibil acum</span></div>`;
      }

      // Rezolvare bug duplicare: Eliminăm din lista vizuală elementul care este deja marcat ca Următorul (upcoming[0])
      const remainingUpcoming = currentActive ? upcoming.slice(1) : upcoming;
      if (remainingUpcoming.length > 0) {
        userInfo += `<div class="info-row" style="margin-top:5px; color:var(--text-muted); font-size:0.9rem;"><ion-icon name="list-outline"></ion-icon> <strong>Așteaptă la rând:</strong></div>`;
        remainingUpcoming.slice(0, 3).forEach(b => {
          userInfo += `
            <div class="info-row" style="font-size: 0.85rem; margin-left: 20px; color: #FFF;">
              - ${this.sanitizeHTML(b.user)} (Ap. ${b.ap}) &nbsp;|&nbsp; <span style="color: var(--primary-color);">${b.startTime} - ${b.endTime}</span>
            </div>
          `;
        });
      }

      const tradeOffers = eq.bookings.filter(b => b.status === 'La schimb' && this.parseDateTime(b.date, b.endTime).getTime() > now);
      if (tradeOffers.length > 0) {
        userInfo += `<div style="margin-top: 15px; border-top: 1px dashed var(--glass-border); padding-top: 10px;">`;
        tradeOffers.forEach(trade => {
          userInfo += `
            <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(139, 92, 246, 0.1); padding: 8px; border-radius: 6px; margin-bottom: 5px;">
              <div>
                <span class="trade-badge">La schimb</span>
                <div style="font-size:0.8rem; color:var(--text-main); margin-top:4px;">${trade.startTime} - ${trade.endTime}</div>
              </div>
              <button class="btn-trade btn-claim-trade" data-eqid="${eq.id}" data-id="${trade.id}" style="font-weight:bold;">Revendică</button>
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
        <div class="action-hint">Click pentru a gestiona programarea</div>
      `;

      if (eq.type === 'washer') washersContainer.appendChild(card);
      else dryersContainer.appendChild(card);
    });

    this.updateStats();
  }

  async handleClaimTrade(btn) {
    if (!this.loggedInUser) {
      this.showToast('Trebuie să fii logat pentru a revendica!', 'error');
      return;
    }
    const eqId = btn.getAttribute('data-eqid');
    const tradeId = btn.getAttribute('data-id');
    
    await this.loadData();
    const eq = this.equipments.find(e => e.id === eqId);
    if (!eq) return;

    const tradeBooking = eq.bookings.find(b => b.id === tradeId);
    if (!tradeBooking) return;

    tradeBooking.user = this.loggedInUser.name;
    tradeBooking.ap = this.loggedInUser.ap;
    tradeBooking.pin = this.loggedInUser.pw;
    tradeBooking.status = 'Rezervat';
    
    // Corectare punctaj leaderboard: Sincronizare automată în istoric general la revendicare
    const histEntry = this.history.find(h => h.id === tradeId);
    if (histEntry) {
      histEntry.user = this.loggedInUser.name;
      histEntry.ap = this.loggedInUser.ap;
    }

    this.showSuccessAnimation('Ai revendicat programarea cu succes!');
    await this.saveData();
    this.renderDashboard();
    this.renderLeaderboard();
  }

  renderAnnouncement() {
    const bannerContainer = document.getElementById('announcement-banner-container');
    if (!bannerContainer) return;
    if (!this.announcement) {
      bannerContainer.innerHTML = '';
      return;
    }

    const age = new Date().getTime() - this.announcement.timestamp;
    if (age > 5 * 60 * 1000) { // Bannerul dispare automat din memorie după exact 5 minute
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

  checkUpcomingAnnouncements() {
    const now = new Date().getTime();
    let needsSave = false;

    this.equipments.forEach(eq => {
      eq.bookings.forEach(b => {
        if (b.status === 'Anulat' || b.status === 'Finalizat' || b.status === 'Liber') return;
        
        const bStart = this.parseDateTime(b.date, b.startTime).getTime();
        const diff = bStart - now;
        
        if (diff > 0 && diff <= 5 * 60 * 1000 && !b.announced) {
          b.announced = true;
          needsSave = true;
          this.setAnnouncement(`Pregătește-te! Peste aprox. 5 minute urmează programarea lui <strong>${this.sanitizeHTML(b.user)} (Ap. ${b.ap})</strong> la <strong>${this.sanitizeHTML(eq.name)}</strong>.`);
        }
      });
    });

    if (needsSave) {
      this.saveData();
      this.renderDashboard();
    }
  }

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
      if (dateStr === (this.currentWeeklyDate || currentDateStr)) {
        btn.classList.add('active');
        activeDateStr = dateStr;
      }
      
      const parts = dateStr.split('-');
      let labelName = dayNames[d.getDay()];
      if (i === 0) labelName = 'Azi';
      if (i === 1) labelName = 'Mâine';

      btn.textContent = `${labelName} (${parts[2]}/${parts[1]})`;
      btn.setAttribute('data-date', dateStr);
      
      tabsContainer.appendChild(btn);
    }
    
    if (!tabsContainer.dataset.listenerAttached) {
      tabsContainer.addEventListener('click', (e) => {
        const tab = e.target.closest('.day-tab');
        if (tab) {
          document.querySelectorAll('.day-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          this.renderWeeklySchedule(tab.getAttribute('data-date'));
        }
      });
      tabsContainer.dataset.listenerAttached = "true";
    }

    this.currentWeeklyDate = activeDateStr || this.weekDates[0];
    this.renderWeeklySchedule(this.currentWeeklyDate);
  }

  renderWeeklySchedule(dateStr) {
    this.currentWeeklyDate = dateStr;
    const tbody = document.getElementById('weekly-table-body');
    const noData = document.getElementById('no-weekly-data');
    if (!tbody || !noData) return;
    
    tbody.innerHTML = '';
    let allBookings = [];
    
    this.equipments.forEach(eq => {
      eq.bookings.forEach(b => {
        if (b.date === dateStr && b.status !== 'Anulat' && b.status !== 'Liber') {
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
        if (b.status === 'Finalizat') displayStatus = 'FINALIZAT';
        else if (b.status === 'Donat către') displayStatus = 'DONAT';
        else if (now >= bStart && now <= bEnd) displayStatus = 'ÎN CURS...';
        else if (now > bEnd) displayStatus = 'FINALIZAT';

        let statusColor = 'var(--text-muted)';
        if (displayStatus === 'ÎN CURS...') statusColor = 'var(--status-ocupat)';
        else if (displayStatus === 'PROGRAMAT') statusColor = 'var(--primary-color)';
        else if (displayStatus === 'FINALIZAT') statusColor = 'var(--status-liber)';
        else if (displayStatus === 'DONAT') statusColor = 'var(--status-donat)';

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong style="color:var(--primary-color)">${b.startTime} - ${b.endTime}</strong></td>
          <td>${this.sanitizeHTML(b.eqName)}</td>
          <td>${this.sanitizeHTML(b.user)} (Ap. ${b.ap})</td>
          <td><span class="status-badge" style="border: 1px solid ${statusColor}; color: ${statusColor};">${displayStatus}</span></td>
        `;
        tbody.appendChild(tr);
      });
    }
  }

  // Execuția securizată a finalizării ciclurilor de spălare (Fără re-salvări asincrone recursive)
  tickTimers() {
    const clockEl = document.getElementById('live-clock');
    if (clockEl) {
      clockEl.textContent = new Date().toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }

    const timers = document.querySelectorAll('.realtime-timer');
    const now = new Date().getTime();
    let localFinalizationOccurred = false;

    timers.forEach(timer => {
      const endTimestamp = parseInt(timer.getAttribute('data-end'), 10);
      const eqId = timer.getAttribute('data-eqid');
      const bookingId = timer.getAttribute('data-id');
      const diff = endTimestamp - now;

      if (diff <= 0) {
        timer.innerHTML = `<ion-icon name="checkmark-done-outline"></ion-icon> Ciclul s-a încheiat!`;
        const eq = this.equipments.find(e => e.id === eqId);
        if (eq) {
          const fb = eq.bookings.find(b => b.id === bookingId);
          if (fb && fb.status !== 'Finalizat') {
            fb.status = 'Finalizat';
            localFinalizationOccurred = true;
          }
        }
      } else {
        const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((diff % (1000 * 60)) / 1000);
        timer.innerHTML = `<ion-icon name="hourglass-outline"></ion-icon> Rămas: ${h > 0 ? h + 'h ' : ''}${m}m ${s}s`;
      }
    });

    document.querySelectorAll('.timer-progress-fill').forEach(bar => {
      const start = parseInt(bar.getAttribute('data-start'), 10);
      const end = parseInt(bar.getAttribute('data-end'), 10);
      const pct = Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
      bar.style.width = pct + '%';
    });

    if (localFinalizationOccurred) {
      this.renderDashboard();
      if (this.currentWeeklyDate) this.renderWeeklySchedule(this.currentWeeklyDate);
    }
  }

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

    warnedUsers.forEach(u => {
      if (!u.strikeHistory || u.strikeHistory.length === 0) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td><strong>${this.sanitizeHTML(u.name)}</strong></td><td>-</td><td>-</td><td><span style="color:#EF4444;">${u.strikes}/3</span></td>`;
        tbody.appendChild(tr);
        return;
      }

      u.strikeHistory.forEach((strike, idx) => {
        const tr = document.createElement('tr');
        const d = new Date(strike.date).toLocaleDateString('ro-RO');
        const e = new Date(strike.expiry).toLocaleDateString('ro-RO');
        
        let actHtml = this.isAdmin ? `<button class="btn-remove-warn" data-user="${this.sanitizeHTML(u.name)}" data-idx="${idx}" style="background:none; border:none; color:var(--status-liber); cursor:pointer;"><ion-icon name="trash"></ion-icon></button>` : '';

        tr.innerHTML = `
          <td><strong>${this.sanitizeHTML(u.name)}</strong> <small>(Warn #${idx+1})</small></td>
          <td>${d}</td>
          <td>${e}</td>
          <td style="display:flex; align-items:center; gap:10px;"><span style="color:#EF4444; font-weight:bold;">${u.strikes}/3</span> ${actHtml}</td>
        `;
        tbody.appendChild(tr);
      });
    });

      }

  cleanupExpiredWarns() {
    let changed = false;
    const now = new Date();
    
    this.users.forEach(u => {
      if (u.strikeHistory && u.strikeHistory.length > 0) {
        const originalLength = u.strikeHistory.length;
        u.strikeHistory = u.strikeHistory.filter(s => new Date(s.expiry) >= now);
        if (u.strikeHistory.length !== originalLength) {
          u.strikes = u.strikeHistory.length;
          changed = true;
        }
      } else if (u.strikes > 0 && u.strikeExpiryDate) {
        if (new Date(u.strikeExpiryDate) < now) {
          u.strikes = 0;
          changed = true;
        }
      }
    });

    return changed;
  }

  renderHistory() {
    const tbody = document.getElementById('history-body');
    const noData = document.getElementById('no-history');
    if (!tbody || !noData) return;
    
    tbody.innerHTML = '';
    if (this.history.length === 0) {
      noData.style.display = 'block';
      return;
    }
    
    noData.style.display = 'none';

    this.history.forEach(h => {
      const tr = document.createElement('tr');
      let displayStatus = h.finalStatus || 'FINALIZAT';
      let statusStyle = 'border: 1px solid var(--text-muted); color: var(--text-muted);';
      
      const upperStatus = displayStatus.toUpperCase();
      if (upperStatus === 'PROGRAMAT') statusStyle = 'border: 1px solid var(--primary-color); color: var(--primary-color);';
      else if (upperStatus.includes('ANULAT')) statusStyle = 'border: 1px solid var(--status-ocupat); color: var(--status-ocupat);';
      else if (upperStatus === 'FINALIZAT') statusStyle = 'border: 1px solid var(--status-liber); color: var(--status-liber);';

      // Fallback inteligent pentru compatibilitate inversă structurală (Schema Mismatch protection)
      let scheduledForDisplay = h.scheduledFor || "N/A";
      if (h.startTimestamp && h.endTimestamp) {
        scheduledForDisplay = `${new Date(h.startTimestamp).toLocaleTimeString('ro-RO', {hour:'2-digit', minute:'2-digit'})} - ${new Date(h.endTimestamp).toLocaleTimeString('ro-RO', {hour:'2-digit', minute:'2-digit'})}`;
      }

      tr.innerHTML = `
        <td>${h.date}</td>
        <td><strong>${this.sanitizeHTML(h.eqName)}</strong><br><small>${this.sanitizeHTML(scheduledForDisplay)}</small></td>
        <td>${this.sanitizeHTML(h.user)}</td>
        <td>Ap. ${h.ap}</td>
        <td><span class="status-badge" style="${statusStyle}">${upperStatus}</span></td>
      `;
      tbody.appendChild(tr);
    });
  }

  setupModal() {
    // Moved to setupDelegations
  }
  
  openModal(eq, targetBooking, isActive = true) {
    this.currentActionMachine = eq;
    this.currentActiveBooking = targetBooking;

    document.getElementById('modal-title').textContent = eq.name;
    const sub = document.getElementById('modal-subtitle');
    
    if (targetBooking) {
      sub.textContent = `${isActive ? 'Acum' : 'Urmează'}: ${targetBooking.user} (Ap. ${targetBooking.ap}) [${targetBooking.startTime} - ${targetBooking.endTime}]`;
    } else {
      sub.textContent = `Echipamentul este complet liber.`;
    }

    const futureContainer = document.getElementById('modal-future-bookings');
    if (futureContainer) {
      futureContainer.innerHTML = '<h3 style="color:var(--primary-color); font-size:1rem; margin-bottom:8px;">Programări viitoare:</h3>';
      const scrollDiv = document.createElement('div');
      scrollDiv.style = 'max-height:200px; overflow-y:auto;';
      
      const future = eq.bookings.filter(b => b.status === 'Programat');
      if (future.length === 0) {
        scrollDiv.innerHTML = '<p style="color:var(--text-muted); font-size:0.85rem;">Nu sunt rezervări viitoare.</p>';
      } else {
        future.forEach(b => {
          const div = document.createElement('div');
          div.style = 'display:flex; justify-content:space-between; align-items:center; background:rgba(0,0,0,0.2); padding:6px; margin-bottom:4px; border-radius:4px;';
          div.innerHTML = `<div><strong>${this.sanitizeHTML(b.user)}</strong> (Ap.${b.ap})<br><small>${b.startTime}-${b.endTime}</small></div>`;
          
          if (this.loggedInUser && this.loggedInUser.name.toLowerCase() === b.user.toLowerCase()) {
            const cBtn = document.createElement('button');
            cBtn.textContent = 'Anulează';
            cBtn.style = 'background:#ff4d4d; border:none; color:#fff; padding:3px 6px; border-radius:3px; font-size:0.75rem;';
            cBtn.setAttribute('data-eqid', b.eqId);
      cBtn.setAttribute('data-bid', b.id);
      
            div.appendChild(cBtn);
          }
          scrollDiv.appendChild(div);
        });
      }
      futureContainer.appendChild(scrollDiv);
    }

    document.getElementById('action-modal').classList.add('active');
  }

  async updateMachineStatus(newStatus, donateName = null) {
          if (!this.currentActionMachine) return;
      if (!this.currentActiveBooking) {
        this.showToast('Mașina este deja goală / nu ai ce anula!', 'error');
        return;
      }
    
    await this.loadData();
    const eq = this.equipments.find(e => e.id === this.currentActionMachine.id);
    const b = eq ? eq.bookings.find(bk => bk.id === this.currentActiveBooking.id) : null;
    
    if (b) {
      if (newStatus !== 'Ocupat') {
        if (!this.isAdmin && (!this.loggedInUser || this.loggedInUser.name !== b.user)) {
          this.showToast('Nu ai permisiune!', 'error');
          return;
        }
        if (!confirm('Ești sigur?')) return;
      }

      b.status = (newStatus === 'Liber' || newStatus === 'Anulat') ? newStatus : b.status;
      if (newStatus === 'Donat către') {
        b.status = 'Donat către';
        b.user = donateName;
      }

      this.history.unshift({
        id: b.id,
        date: new Date().toLocaleString('ro-RO'),
        eqName: eq.name,
        user: b.user,
        ap: b.ap,
        scheduledFor: `${b.date} (${b.startTime} - ${b.endTime})`,
        finalStatus: newStatus
      });

      await this.saveData();
      this.renderDashboard();
    }
    document.getElementById('action-modal').classList.remove('active');
  }

  setupThemeAndLang() {
    const tBtn = document.getElementById('theme-toggle');
    const lBtn = document.getElementById('lang-toggle');
    if (tBtn) {
      tBtn.onclick = () => {
        this.isLightMode = !this.isLightMode;
        document.body.classList.toggle('light-theme', this.isLightMode);
        localStorage.setItem('spalatorie_theme', this.isLightMode ? 'light' : 'dark');
        this.applyTranslations();
      };
    }
    if (lBtn) {
      lBtn.onclick = () => {
        this.currentLang = this.currentLang === 'ro' ? 'en' : 'ro';
        localStorage.setItem('spalatorie_lang', this.currentLang);
        this.applyTranslations();
      };
    }
  }

  applyTranslations() {
    const dict = {
      ro: { themeToggle: this.isLightMode ? 'Dark Mode' : 'Light Mode', navHistory: 'Istoric Utilizări', navLeaderboard: 'Clasament', navInstructions: 'Instrucțiuni', leaderboardTitle: 'Clasament Apartamente', leaderboardDesc: 'Top bazat pe spălări finalizate.', adminTitle: 'Panou Administrator', reportBtn: 'Raportează Defecțiune' },
      en: { themeToggle: this.isLightMode ? 'Dark Mode' : 'Light Mode', navHistory: 'Usage History', navLeaderboard: 'Leaderboard', navInstructions: 'Instructions', leaderboardTitle: 'Leaderboard', leaderboardDesc: 'Top completed washes.', adminTitle: 'Admin Panel', reportBtn: 'Report Broken' }
    };
    const t = dict[this.currentLang] || dict.ro;
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const k = el.getAttribute('data-i18n');
      if (t[k]) el.innerHTML = t[k];
    });
    const span = document.querySelector('#lang-toggle span');
    if (span) span.textContent = this.currentLang === 'ro' ? 'English' : 'Română';
  }

  setupAdminPanel() {
    const adminView = document.getElementById('nav-admin');
    const loginPanel = document.getElementById('admin-login-panel');
    const dashboardPanel = document.getElementById('admin-dashboard-panel');
    if (!adminView || !loginPanel || !dashboardPanel) return;

    if (this.loggedInUser && ['developer', 'admin', 'sef'].includes(this.loggedInUser.role)) {
      adminView.style.display = 'flex';
      this.isAdmin = true;
      loginPanel.style.display = 'none';
      dashboardPanel.style.display = 'grid';
      this.renderAdminBookings();
    } else {
      adminView.style.display = 'none';
      this.isAdmin = false;
    }

    const authLBtn = document.getElementById('btn-admin-login');
    if (authLBtn) {
      authLBtn.onclick = () => {
        if (document.getElementById('admin-password').value === 'Alexnae23#') {
          loginPanel.style.display = 'none';
          dashboardPanel.style.display = 'grid';
          this.isAdmin = true;
          this.renderAdminBookings();
          this.showToast('Autentificat ca Admin!', 'success');
        } else {
          this.showToast('Parolă incorectă!', 'error');
        }
      };
    }

    const annBtn = document.getElementById('btn-admin-announce');
    if (annBtn) {
      annBtn.onclick = () => {
        const tx = document.getElementById('admin-announcement-text').value.trim();
        if (tx) { this.setAnnouncement(tx); this.showToast('Anunț publicat!'); }
      };
    }

    // Aliniere roluri standardizate din panoul administrativ ('sef' peste tot)
    const roleBtn = document.getElementById('btn-admin-role');
    if (roleBtn) {
      roleBtn.onclick = async () => {
        const targetUser = document.getElementById('admin-role-user').value.trim();
        let targetRole = document.getElementById('admin-role-select').value;
        if (targetRole === 'sefcamin') targetRole = 'sef';

        const uObj = this.users.find(u => u.name.toLowerCase() === targetUser.toLowerCase());
        if (uObj) {
          uObj.role = targetRole;
          await this.saveData();
          this.showToast(`Rol actualizat pentru ${uObj.name}!`);
        }
      };
    }

    // Curățare forțată a rezervărilor de către Admin
    const fCancelBtn = document.getElementById('btn-admin-force-cancel');
    if (fCancelBtn) {
      fCancelBtn.onclick = async () => {
        const uTarget = document.getElementById('admin-force-cancel-user').value.toLowerCase().trim();
        let changed = false;
        this.equipments.forEach(eq => {
          eq.bookings.forEach(b => {
            if (b.status === 'Programat' && b.user.toLowerCase().trim() === uTarget) {
              b.status = 'Anulat';
              this.history.unshift({ id: b.id, date: new Date().toLocaleString('ro-RO'), eqName: eq.name, user: b.user, ap: b.ap, scheduledFor: `${b.date} (${b.startTime}-${b.endTime})`, finalStatus: 'ANULAT (FORȚAT ADMIN)' });
              changed = true;
            }
          });
        });
        if (changed) { await this.saveData(); this.renderDashboard(); this.renderAdminBookings(); this.showToast('Anulat forțat!'); }
      };
    }

    // Trimitere Avertisment (Strike/Warn) manual
    const warnBtn = document.getElementById('btn-admin-strike');
    if (warnBtn) {
      warnBtn.onclick = async () => {
        const uTarget = document.getElementById('admin-strike-user').value.toLowerCase().trim();
        const uObj = this.users.find(u => u.name.toLowerCase() === uTarget);
        if (uObj) {
          if (!uObj.strikeHistory) uObj.strikeHistory = [];
          const now = new Date();
          uObj.strikeHistory.push({ date: now.toISOString(), expiry: new Date(now.getTime() + 24*60*60*1000).toISOString() });
          uObj.strikes = uObj.strikeHistory.length;
          await this.saveData();
          this.showToast(`Warn trimis! Total strikes: ${uObj.strikes}`);
        }
      };
    }

    // Adăugare programare din modulul de Admin
    const addBBtn = document.getElementById('btn-admin-add-booking');
    if (addBBtn) {
      addBBtn.onclick = async () => {
        const mName = document.getElementById('admin-add-machine').value;
        const uName = document.getElementById('admin-add-user').value.trim();
        const uAp = document.getElementById('admin-add-ap').value.trim();
        const dStr = document.getElementById('admin-add-date').value;
        const sTime = document.getElementById('admin-add-start').value;
        const eTime = document.getElementById('admin-add-end').value;

        if (!uName || !dStr || !sTime || !eTime) { this.showToast('Completați tot!', 'error'); return; }

        await this.loadData();
        const eq = this.equipments.find(e => e.name === mName);
        if (!eq) return;

        const nStart = this.parseDateTime(dStr, sTime).getTime();
        let nEnd = this.parseDateTime(dStr, eTime).getTime();
        if (nEnd <= nStart) nEnd += 24*60*60*1000;

        const overlap = eq.bookings.some(b => {
          if (b.status === 'Anulat' || b.status === 'Finalizat' || b.status === 'Liber') return false;
          const bs = this.parseDateTime(b.date, b.startTime).getTime();
          let be = this.parseDateTime(b.date, b.endTime).getTime();
          if (be <= bs) be += 24*60*60*1000;
          return (nStart < be && nEnd > bs);
        });

        if (overlap) { this.showToast('Interval ocupat!', 'error'); return; }

        const bId = Date.now().toString() + Math.random().toString(36).substr(2,3);
        eq.bookings.push({ id: bId, user: uName, ap: uAp, date: dStr, startTime: sTime, endTime: eTime, status: 'Programat' });
        this.history.unshift({ id: bId, date: new Date().toLocaleString('ro-RO'), eqName: eq.name, user: 'ADMIN -> ' + uName, ap: uAp, scheduledFor: `${dStr} (${sTime} - ${eTime})`, finalStatus: 'Programat' });
        
        await this.saveData();
        this.renderDashboard();
        this.renderAdminBookings();
        this.showToast('Adăugat de admin!');
      };
    }
  }

  renderAdminBookings() {
    const list = document.getElementById('admin-all-bookings-list');
    if (!list) return;
    list.innerHTML = '';
    const now = new Date().getTime();
    let activeList = [];

    this.equipments.forEach(eq => {
      eq.bookings.forEach(b => {
        if (b.status === 'Anulat' || b.status === 'Finalizat' || b.status === 'Liber') return;
        let be = this.parseDateTime(b.date, b.endTime).getTime();
        let bs = this.parseDateTime(b.date, b.startTime).getTime();
        if (be <= bs) be += 24*60*60*1000;
        if (be > now) activeList.push({ ...b, eqName: eq.name, eqId: eq.id });
      });
    });

    if (activeList.length === 0) { list.innerHTML = '<p style="color:var(--text-muted);">Fără programări active.</p>'; return; }

    activeList.forEach(b => {
      const row = document.createElement('div');
      row.style = 'display:flex; justify-content:space-between; padding:8px; background:rgba(0,0,0,0.2); margin-bottom:4px; border-radius:6px;';
      row.innerHTML = `<div><strong>${this.sanitizeHTML(b.eqName)}</strong>: ${this.sanitizeHTML(b.user)} (Ap.${b.ap})<br><small>${b.startTime}-${b.endTime}</small></div>`;
      
      const cBtn = document.createElement('button');
      cBtn.textContent = 'Anulează';
      cBtn.className = 'btn-status btn-anulat';
      cBtn.onclick = async () => {
        if (confirm('Anulezi rezervarea?')) {
          await this.loadData();
          const eq = this.equipments.find(e => e.id === b.eqId);
          const bk = eq ? eq.bookings.find(bk => bk.id === b.id) : null;
          if (bk) {
            bk.status = 'Anulat';
            this.history.unshift({ id: bk.id, date: new Date().toLocaleString('ro-RO'), eqName: eq.name, user: bk.user, ap: bk.ap, scheduledFor: `${bk.date} (${bk.startTime}-${bk.endTime})`, finalStatus: 'ANULAT' });
            await this.saveData();
            this.renderDashboard();
            this.renderAdminBookings();
            this.showToast('Anulată!');
          }
        }
      };
      row.appendChild(cBtn);
      list.appendChild(row);
    });
  }

  renderLeaderboard() {
    const container = document.getElementById('leaderboard-container');
    if (!container) return;
    
    const stats = {};
    this.history.forEach(h => {
      if (h.finalStatus && h.finalStatus.toUpperCase() === 'FINALIZAT') {
        if (!stats[h.ap]) stats[h.ap] = 0;
        stats[h.ap]++;
      }
    });

    const sorted = Object.keys(stats).map(ap => ({ ap, count: stats[ap] })).sort((a, b) => b.count - a.count).slice(0, 10);
    container.innerHTML = '';
    
    if (sorted.length === 0) { container.innerHTML = `<p style="color:var(--text-muted);">Nicio spălare înregistrată.</p>`; return; }

    sorted.forEach((item, index) => {
      container.innerHTML += `
        <div class="leaderboard-item">
          <div style="display:flex; align-items:center; gap:15px;">
            <div class="rank-badge">${index + 1}</div>
            <strong>Apartamentul ${item.ap}</strong>
          </div>
          <div><strong>${item.count}</strong> spălări</div>
        </div>
      `;
    });
  }

  setupReportBroken() {
    const rModal = document.getElementById('report-modal');
    const closeR = document.getElementById('close-report-modal');
    const bOpen = document.getElementById('btn-open-report');
    const bConfirm = document.getElementById('btn-confirm-report');

    if (bOpen) bOpen.onclick = () => { document.getElementById('action-modal').classList.remove('active'); rModal.classList.add('active'); };
    if (closeR) closeR.onclick = () => rModal.classList.remove('active');

    if (bConfirm) {
      bConfirm.onclick = async () => {
        if (this.currentActionMachine) {
          await this.loadData();
          const target = this.equipments.find(e => e.id === this.currentActionMachine.id);
          if (target) {
            target.status = 'Indisponibil momentan';
            target.isBroken = true; // Setare proprietate dedicată fără alterare destructivă a array-ului
            await this.saveData();
            this.renderDashboard();
            this.showToast('Echipament raportat ca defect!');
          }
        }
        rModal.classList.remove('active');
      };
    }
  }

  
   
  setupDelegations() {
    // 1. Dashboard Events
    const attachDashboardClick = (container) => {
      if (!container) return;
      container.addEventListener('click', (e) => {
        const claimBtn = e.target.closest('.btn-claim-trade');
        if (claimBtn) {
          this.handleClaimTrade(claimBtn);
          return;
        }
        const card = e.target.closest('.machine-card');
        if (card) {
          const eqId = card.getAttribute('data-eqid');
          const eq = this.equipments.find(el => el.id === eqId);
          if (eq) {
            let currentActive = null;
            let upcoming = [];
            const now = new Date().getTime();
            const todayStr = this.getLocalDateStr(new Date());
            eq.bookings.forEach(b => {
              if (b.status === 'Anulat' || b.status === 'Finalizat' || b.status === 'Liber') return;
              const bStart = this.parseDateTime(b.date, b.startTime).getTime();
              let bEnd = this.parseDateTime(b.date, b.endTime).getTime();
              if (bEnd <= bStart) bEnd += 24 * 60 * 60 * 1000;
              if (now >= bStart && now <= bEnd) currentActive = b;
              else if (bStart > now && b.date === todayStr) upcoming.push(b);
            });
            this.openModal(eq, currentActive || (upcoming.length > 0 ? upcoming[0] : null), !!currentActive);
          }
        }
      });
    };
    attachDashboardClick(document.getElementById('washers-container'));
    attachDashboardClick(document.getElementById('dryers-container'));

    // 2. Chat Events
    const chatContainer = document.getElementById('chat-messages');
    if (chatContainer) {
      chatContainer.addEventListener('click', async (e) => {
        const likeTrigger = e.target.closest('.chat-like-trigger');
        if (likeTrigger && this.loggedInUser) {
          const id = likeTrigger.getAttribute('data-id');
          const m = this.chatMessages.find(msg => msg.id === id);
          if (m) {
            if (!m.likes) m.likes = [];
            if (m.likes.includes(this.loggedInUser.name)) m.likes = m.likes.filter(n => n !== this.loggedInUser.name);
            else m.likes.push(this.loggedInUser.name);
            await this.saveData();
            this.renderChat();
          }
          return;
        }
        
        const delTrigger = e.target.closest('.chat-delete-btn');
        if (delTrigger && confirm('Stergi mesajul?')) {
          const id = delTrigger.getAttribute('data-id');
          this.chatMessages = this.chatMessages.filter(m => m.id !== id);
          await this.saveData();
          this.renderChat();
          return;
        }
      });
    }

    // 3. Modal Events
    const modal = document.getElementById('action-modal');
    if (modal) {
      modal.addEventListener('click', async (e) => {
        if (e.target.closest('.close-modal')) {
          modal.classList.remove('active');
          return;
        }
        
        if (e.target === modal) {
          modal.classList.remove('active');
          return;
        }

        const statusBtn = e.target.closest('.btn-status:not(#btn-donate)');
        if (statusBtn) {
          await this.updateMachineStatus(statusBtn.getAttribute('data-status'));
          return;
        }

        const donateBtn = e.target.closest('#btn-donate');
        if (donateBtn) {
          const dName = document.getElementById('donate-name').value.trim();
          if (!dName) { this.showToast('Introdu numele persoanei!', 'error'); return; }
          await this.updateMachineStatus('Donat către', dName);
          return;
        }

        const announceBtn = e.target.closest('#btn-announce');
        if (announceBtn) {
          if (!this.currentActionMachine) return;
          const future = this.currentActionMachine.bookings.filter(b => b.status === 'Programat').sort((a,b)=>this.parseDateTime(a.date, a.startTime).getTime() - this.parseDateTime(b.date, b.startTime).getTime());
          if (future.length === 0) { this.showToast('Nu există programări viitoare!', 'error'); return; }
          this.setAnnouncement(`Urmează <strong>${this.sanitizeHTML(future[0].user)} (Ap. ${future[0].ap})</strong> la <strong>${this.sanitizeHTML(this.currentActionMachine.name)}</strong>!`);
          modal.classList.remove('active');
          return;
        }
      });
    }

    // 4. Global fallback for body actions (admin buttons, cancel form etc)
    document.body.addEventListener('click', async (e) => {
      const adminCancelBtn = e.target.closest('.btn-anulat');
      if (adminCancelBtn && confirm('Anulezi rezervarea?')) {
        const eqId = adminCancelBtn.getAttribute('data-eqid');
        const bId = adminCancelBtn.getAttribute('data-bid');
        await this.loadData();
        const eq = this.equipments.find(el => el.id === eqId);
        const bk = eq ? eq.bookings.find(b => b.id === bId) : null;
        if (bk) {
          bk.status = 'Anulat';
          this.history.unshift({ id: bk.id, date: new Date().toLocaleString('ro-RO'), eqName: eq.name, user: bk.user, ap: bk.ap, scheduledFor: `${bk.date} (${bk.startTime}-${bk.endTime})`, finalStatus: 'ANULAT' });
          await this.saveData();
          this.renderDashboard();
          this.renderAdminBookings();
          this.showToast('Anulata!');
        }
        return;
      }

      const cancelActionBtn = e.target.closest('.btn-cancel-action');
      if (cancelActionBtn && confirm('Esti sigur ca vrei sa anulezi definitiv aceasta programare?')) {
        const eqId = cancelActionBtn.getAttribute('data-eq');
        const bId = cancelActionBtn.getAttribute('data-bid');
        await this.loadData();
        const targetEq = this.equipments.find(el => el.id === eqId);
        if (targetEq) {
          const b = targetEq.bookings.find(bk => bk.id === bId);
          if (b) {
            b.status = 'Anulat';
            this.history.unshift({ id: b.id, date: new Date().toLocaleString('ro-RO'), eqName: targetEq.name, user: b.user, ap: b.ap, scheduledFor: `${b.date} (${b.startTime} - ${b.endTime})`, finalStatus: 'ANULAT' });
            await this.saveData();
            this.renderDashboard();
            if (this.currentWeeklyDate) this.renderWeeklySchedule(this.currentWeeklyDate);
            this.showToast('Programare anulata!');
            const btnSearch = document.getElementById('btn-search-cancel');
            if (btnSearch) btnSearch.click();
          }
        }
        return;
      }

      const tradeActionBtn = e.target.closest('.btn-trade-action');
      if (tradeActionBtn && confirm('Oferi programarea la schimb pe avizier?')) {
        const eqId = tradeActionBtn.getAttribute('data-eq');
        const bId = tradeActionBtn.getAttribute('data-bid');
        await this.loadData();
        const targetEq = this.equipments.find(el => el.id === eqId);
        if (targetEq) {
          const b = targetEq.bookings.find(bk => bk.id === bId);
          if (b) {
            b.status = 'La schimb';
            await this.saveData();
            this.renderDashboard();
            this.showToast('Programare pusa la schimb!');
            const btnSearch = document.getElementById('btn-search-cancel');
            if (btnSearch) btnSearch.click();
          }
        }
        return;
      }

      const removeWarnBtn = e.target.closest('.btn-remove-warn');
      if (removeWarnBtn) {
        const uName = removeWarnBtn.getAttribute('data-user');
        const idx = parseInt(removeWarnBtn.getAttribute('data-idx'), 10);
        const uObj = this.users.find(u => u.name === uName);
        if (uObj && uObj.strikeHistory) {
          uObj.strikeHistory.splice(idx, 1);
          uObj.strikes = uObj.strikeHistory.length;
          await this.saveData();
          this.renderWarns();
          this.showToast('Warn eliminat!');
        }
        return;
      }
    });
  }

  initializeUI() {
    this.setupBookingForm();
    this.setupCancelForm();
    this.setupModal();
    this.renderDashboard();
    this.generateWeekTabs();
    this.renderHistory();
    this.renderLeaderboard();
    this.setupAdminPanel();
    this.setupReportBroken();
    this.setupChat();
  }

   checkAuth() {
    const savedUser = localStorage.getItem('spalatorie_logged_in');
    if (savedUser) {
      this.loggedInUser = JSON.parse(savedUser);
      const dbUser = this.users.find(u => u.name === this.loggedInUser.name);
      if (dbUser && dbUser.strikes >= 3) {
        this.showToast('Cont blocat din cauza avertismentelor!', 'error');
        this.loggedInUser = null;
        localStorage.removeItem('spalatorie_logged_in');
      }
    }

    if (this.loggedInUser) {
      document.getElementById('auth-screen').style.display = 'none';
      document.getElementById('app-container').style.display = 'flex';
      this.isAdmin = ['admin', 'developer', 'sef'].includes(this.loggedInUser.role);
      if (!this.uiInitialized) { this.initializeUI(); this.uiInitialized = true; }
      this.renderChat();
    } else {
      document.getElementById('auth-screen').style.display = 'flex';
      document.getElementById('app-container').style.display = 'none';
    }
  }

  setupAuth() {
    const bLogin = document.getElementById('btn-login');
    const bRegister = document.getElementById('btn-register');
    const lRegister = document.getElementById('link-to-register');
    const lLogin = document.getElementById('link-to-login');

    if (lRegister) lRegister.onclick = (e) => { e.preventDefault(); document.getElementById('login-form-container').style.display = 'none'; document.getElementById('register-form-container').style.display = 'block'; };
    if (lLogin) lLogin.onclick = (e) => { e.preventDefault(); document.getElementById('register-form-container').style.display = 'none'; document.getElementById('login-form-container').style.display = 'block'; };

    // Securizare eliminare resetare nesecurizată directă din client
    const resetLink = document.getElementById('link-to-reset');
    if (resetLink) resetLink.style.display = 'none'; 

    if (bRegister) {
      bRegister.onclick = async () => {
        const name = document.getElementById('reg-name').value.trim();
        const scara = document.getElementById('reg-scara').value;
        const ap = document.getElementById('reg-ap').value.trim();
        const pw = document.getElementById('reg-password').value;

        if (!name || !ap || !pw) { this.showToast('Completați tot!', 'error'); return; }
        if (scara === '2') { this.showToast('Doar Scara 1 este arondată momentan!', 'error'); return; }

        await this.loadData();
        if (this.users.some(u => u.name.toLowerCase() === name.toLowerCase())) { this.showToast('Nume duplicat!', 'error'); return; }

        let finalName = name;
        let role = 'user';
        if (name.toLowerCase() === 'alexandru nae' || name.toLowerCase() === 'alexander.dev') {
          finalName = 'alexander.dev';
          role = 'developer';
        }

        const newUser = { name: finalName, ap, pw, strikes: 0, role: role, washes: 0, strikeHistory: [] };
        this.users.push(newUser);
        this.loggedInUser = newUser;
        localStorage.setItem('spalatorie_logged_in', JSON.stringify(newUser));
        await this.saveData();
        this.checkAuth();
        this.showToast('Cont creat!');
      };
    }

    if (bLogin) {
      bLogin.onclick = async () => {
        const name = document.getElementById('auth-name').value.trim();
        const pw = document.getElementById('auth-password').value;
        
        await this.loadData();
        const user = this.users.find(u => u.name.toLowerCase() === name.toLowerCase() && u.pw === pw);
        if (user) {
          this.loggedInUser = user;
          localStorage.setItem('spalatorie_logged_in', JSON.stringify(user));
          this.checkAuth();
          this.showToast('Te-ai logat!');
        } else {
          this.showToast('Date incorecte!', 'error');
        }
      };
    }
  }

  setupChat() {
    const btnSend = document.getElementById('btn-send-chat');
    const input = document.getElementById('chat-input');
    if (!btnSend || !input) return;

    const sendMsg = async () => {
      const val = input.value.trim();
      if (!val || !this.loggedInUser) return;
      
      await this.loadData();
      this.chatMessages.push({
        id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 7),
        author: this.loggedInUser.name,
        ap: this.loggedInUser.ap,
        text: val,
        timestamp: new Date().getTime(),
        role: this.loggedInUser.role || 'user',
        likes: []
      });
      
      if (this.chatMessages.length > 50) this.chatMessages.shift();
      input.value = '';
      await this.saveData();
      this.renderChat();
    };

    btnSend.onclick = sendMsg;
    input.onkeypress = (e) => { if (e.key === 'Enter') sendMsg(); };
  }

  renderChat() {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    container.innerHTML = '';
    if (this.chatMessages.length === 0) {
      container.innerHTML = `<p style="text-align:center; color:var(--text-muted);">Fără mesaje.</p>`;
      return;
    }

    this.chatMessages.forEach(msg => {
      const isMine = this.loggedInUser && msg.author === this.loggedInUser.name;
      const tStr = new Date(msg.timestamp).toLocaleTimeString('ro-RO', {hour:'2-digit', minute:'2-digit'});
      
      let bHtml = '';
      if (msg.role === 'developer') bHtml = `<span style="background:#FF00FF; padding:2px 4px; border-radius:4px; font-size:0.6rem; color:#fff;">Dev</span>`;
      else if (msg.role === 'admin' || msg.role === 'sef') bHtml = `<span style="background:#EF4444; padding:2px 4px; border-radius:4px; font-size:0.6rem; color:#fff;">Admin</span>`;

      const hasLiked = this.loggedInUser && msg.likes && msg.likes.includes(this.loggedInUser.name);
      const lCount = (msg.likes || []).length;
      
      let dBtn = '';
      if (this.loggedInUser && (['developer', 'admin', 'sef'].includes(this.loggedInUser.role) || isMine)) {
        dBtn = `<ion-icon name="trash-outline" class="chat-delete-btn" data-id="${msg.id}" style="color:#EF4444; cursor:pointer; margin-left:10px;"></ion-icon>`;
      }

      const bubble = document.createElement('div');
      bubble.className = 'chat-bubble-wrapper';
      bubble.style.maxWidth = '80%';
      bubble.style.alignSelf = isMine ? 'flex-end' : 'flex-start';
      bubble.style.background = isMine ? 'var(--primary-color)' : 'rgba(255,255,255,0.1)';
      bubble.style.color = isMine ? '#000' : 'var(--text-main)';
      bubble.style.padding = '8px 12px';
      bubble.style.borderRadius = '12px';
      bubble.style.marginBottom = '6px';
      
      bubble.innerHTML = `
        <span style="font-size:0.7rem; font-weight:bold; opacity:0.8; display:flex; align-items:center; gap:4px;">
          ${this.sanitizeHTML(msg.author)} (Ap.${msg.ap}) ${bHtml}
        </span>
        <span style="font-size:0.95rem; word-break:break-word;">${this.sanitizeHTML(msg.text)}</span>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px; font-size:0.75rem;">
          <div class="chat-like-trigger" data-id="${msg.id}" style="cursor:pointer; display:flex; align-items:center; gap:3px;">
            <ion-icon name="${hasLiked ? 'heart' : 'heart-outline'}" style="color:${hasLiked ? '#EF4444' : 'inherit'};"></ion-icon><span>${lCount || ''}</span>
          </div>
          <div><span>${tStr}</span> ${dBtn}</div>
        </div>
      `;
      container.appendChild(bubble);
    });


    container.scrollTop = container.scrollHeight;
  }

  setupProfile() {
    const btnNotif = document.getElementById('btn-enable-notifications');
    if (btnNotif) {
      btnNotif.onclick = () => {
        if (!('Notification' in window)) this.showToast('Incompatibil!', 'error');
        else Notification.requestPermission().then(p => { if (p === 'granted') this.showToast('Notificări active!'); });
      };
    }

    const btnChangePw = document.getElementById('btn-change-pw-profile');
    if (btnChangePw) {
      btnChangePw.onclick = async () => {
        if (!this.loggedInUser) return;
        const oldPw = prompt('Parola curentă:');
        if (oldPw !== this.loggedInUser.pw) { this.showToast('Incorectă!', 'error'); return; }
        const newPw = prompt('Parola nouă:');
        if (!newPw || newPw.length < 4) { this.showToast('Minim 4 caractere!', 'error'); return; }
        
        this.loggedInUser.pw = newPw;
        const u = this.users.find(us => us.name === this.loggedInUser.name);
        if (u) u.pw = newPw;
        
        localStorage.setItem('spalatorie_logged_in', JSON.stringify(this.loggedInUser));
        await this.saveData();
        this.showToast('Parolă schimbată!');
      };
    }

    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
      btnLogout.onclick = () => {
        if (!confirm('Te deconectezi?')) return;
        localStorage.removeItem('spalatorie_logged_in');
        this.loggedInUser = null;
        this.isAdmin = false;
        this.checkAuth();
      };
    }
  }

  renderProfile() {
    if (!this.loggedInUser) return;
    const u = this.users.find(us => us.name === this.loggedInUser.name) || this.loggedInUser;

    document.getElementById('profile-name-display').textContent = u.name;
    document.getElementById('profile-role-display').textContent = u.role === 'developer' ? 'Developer' : (['admin', 'sef'].includes(u.role) ? 'Admin Cămin' : 'Locatar Scara 1');
    document.getElementById('profile-washes').textContent = u.washes || 0;
    document.getElementById('profile-strikes').textContent = u.strikes || 0;

    const bCont = document.getElementById('profile-badges');
    if (!bCont) return;
    bCont.innerHTML = '';
    
    // Corectare bug badge: Verificare istoric complet în strikeHistory pentru Cetățean Model
    const hadNoHistoryStrikes = !u.strikeHistory || u.strikeHistory.length === 0;
    if (u.strikes === 0 && (u.washes || 0) > 0 && hadNoHistoryStrikes) {
      bCont.innerHTML += `<div style="padding:5px; border:1px solid rgba(255,179,0,0.5); font-size:0.8rem; border-radius:6px;">🌟 Cetățean Model</div>`;
    }
    if ((u.washes || 0) >= 10) {
      bCont.innerHTML += `<div style="padding:5px; border:1px solid rgba(59,130,246,0.5); font-size:0.8rem; border-radius:6px; margin-left:5px;">💧 Spălător Pasionat</div>`;
    }
    if (bCont.innerHTML === '') bCont.innerHTML = '<p style="color:var(--text-muted); font-size:0.85rem;">Fără insigne.</p>';
  }

  checkPushNotifications() {
    if (!this.loggedInUser || !('Notification' in window) || Notification.permission !== 'granted') return;
    const now = new Date().getTime();
    this.equipments.forEach(eq => {
      eq.bookings.forEach(b => {
        if (b.user === this.loggedInUser.name && b.status === 'Programat') {
          const bEnd = this.parseDateTime(b.date, b.endTime).getTime();
          const diff = bEnd - now;
          if (diff > 9 * 60 * 1000 && diff <= 10 * 60 * 1000) {
            new Notification('Spălătoria UB', { body: `Rezervarea ta la ${eq.name} se termină în 10 minute!` });
          }
        }
      });
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const initApp = () => { window.app = new SpalatorieApp(); };
  initApp();
});
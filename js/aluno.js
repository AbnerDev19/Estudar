// ARQUIVO: js/aluno.js
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc, updateDoc, collection, addDoc, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let currentUser = null;
// Base do Utilizador + Bases do RPG
let userData = {
    xpTotal: 0,
    dailyStudyGoal: 60,
    dailyXp: 0,
    lastDate: new Date().toDateString(),
    tasks: [],
    habits: [],
    activities: [],
    attributes: [],
    history: []
};
let studySessions = [];
let subjects = [];
let studyChartInstance = null;

const difficultyMap = {
    'easy': { label: 'Fácil', xp: 30, colorClass: 'badge-easy', colorStyle: 'color: #0f7b6c; background: #e5f5e0;' },
    'medium': { label: 'Médio', xp: 60, colorClass: 'badge-medium', colorStyle: 'color: #d9730d; background: #fff3e0;' },
    'hard': { label: 'Difícil', xp: 100, colorClass: 'badge-hard', colorStyle: 'color: #e03e3e; background: #fdeceb;' }
};

document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async(user) => {
        if (user) {
            currentUser = user;
            await carregarDadosUsuario(user.uid);
            await carregarTrilhaDoFirestore();
            setupModals();
            iniciarSalaDeEstudos();
        } else {
            window.location.href = "index.html";
        }
    });

    document.getElementById('btn-logout').addEventListener('click', () => {
        signOut(auth).then(() => window.location.href = "index.html");
    });
});

// =====================================
// NAVEGAÇÃO DE ABAS
// =====================================
window.switchView = function(viewName) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
    document.getElementById(`view-${viewName}`).classList.add('active');
    document.getElementById(`nav-${viewName}`).classList.add('active');
};

// =====================================
// DADOS E FIREBASE
// =====================================
async function carregarDadosUsuario(uid) {
    try {
        const docRef = doc(db, "users", uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            userData = {...userData, ...data };

            // Verifica reset diário
            const today = new Date().toDateString();
            if (userData.lastDate !== today) {
                userData.dailyXp = 0;
                userData.tasks.forEach(t => t.completed = false);
                userData.habits.forEach(h => {
                    if (!h.completedToday) h.streak = 0;
                    h.completedToday = false;
                });
                userData.lastDate = today;
                adicionarHistorico("Novo dia! Progresso resetado.", "ri-sun-line");
                salvarDadosRPG();
            }

            // Carregar Sessões de Estudo
            const q = query(collection(db, "users", uid, "studySessions"), orderBy("timestamp", "desc"));
            const sessionSnaps = await getDocs(q);
            studySessions = [];
            sessionSnaps.forEach(d => studySessions.push(d.data()));

            // Carregar Matérias
            const subSnaps = await getDocs(collection(db, "users", uid, "subjects"));
            subjects = [];
            subSnaps.forEach(d => subjects.push({ id: d.id, ...d.data() }));

            atualizarInterfaceGlobal();
        }
    } catch (e) { console.error("Erro ao carregar:", e); }
}

async function salvarDadosRPG() {
    try {
        await updateDoc(doc(db, "users", currentUser.uid), {
            xpTotal: userData.xpTotal,
            dailyXp: userData.dailyXp,
            lastDate: userData.lastDate,
            tasks: userData.tasks,
            habits: userData.habits,
            activities: userData.activities,
            attributes: userData.attributes,
            history: userData.history
        });
        atualizarInterfaceGlobal();
    } catch (e) { console.error("Erro ao salvar RPG no Firebase:", e); }
}

// =====================================
// RENDERIZAÇÃO GERAL (RPG + ESTUDOS)
// =====================================
function atualizarInterfaceGlobal() {
    // Topo Sidebar
    document.getElementById('aluno-nome').innerText = userData.nome || "Aluno";
    document.getElementById('aluno-nivel').innerText = `Lvl ${Math.floor(userData.xpTotal / 1000) + 1} • XP: ${userData.xpTotal}`;
    document.getElementById('today-xp').innerText = `+${userData.dailyXp} XP Hoje`;

    // Selects Atributos
    const attrHTML = `<option value="none">Geral (Nenhum)</option>` + userData.attributes.map(a => `<option value="${a.id}">${a.name} (Lvl ${a.level})</option>`).join('');
    ['input-task-attr', 'input-habit-attr', 'input-act-attr'].forEach(id => { if (document.getElementById(id)) document.getElementById(id).innerHTML = attrHTML; });

    // Renderizações
    renderizarAtributos();
    renderizarHistorico();
    renderizarTasks();
    renderizarHabits();
    renderizarAtividades();
    renderSubjectSelect();
    atualizarEstatisticasEstudos();
}

// --- RENDERS RPG ---
function renderizarAtributos() {
    const cont = document.getElementById('attributes-container');
    cont.innerHTML = '';
    userData.attributes.forEach(attr => {
        const div = document.createElement('div');
        div.className = 'attr-item';
        div.innerHTML = `
            <div class="flex-between text-sm mb-1"><span class="font-medium">${attr.name}</span><span class="text-sub">Lvl ${attr.level}</span></div>
            <div class="progress-track" style="height:4px;"><div class="progress-fill" style="background:var(--blue); width: ${attr.xp % 100}%"></div></div>
            <button class="icon-btn" onclick="window.removerAttr('${attr.id}')" style="position:absolute; top:-4px; right:0; color:var(--red);"><i class="ri-close-line"></i></button>
        `;
        cont.appendChild(div);
    });
}

function renderizarHistorico() {
    const cont = document.getElementById('history-container');
    cont.innerHTML = '';
    const recent = userData.history.slice(-8).reverse();
    recent.forEach(item => {
        cont.innerHTML += `<li style="display:flex; gap:8px;"><i class="${item.icon} text-yellow"></i><div><span>${item.text}</span><span style="display:block; font-size:0.7rem; color:var(--text-sub);">${item.time}</span></div></li>`;
    });
}

function renderizarTasks() {
    const cont = document.getElementById('tasks-container');
    cont.innerHTML = '';
    if (userData.tasks.length === 0) cont.innerHTML = '<p class="text-sub text-sm">Nenhuma missão. Crie uma acima.</p>';
    userData.tasks.forEach(t => {
        cont.innerHTML += `
            <div style="display:flex; align-items:center; padding:12px; border:1px solid var(--border-color); border-radius:6px; margin-bottom:8px; background:var(--bg-main);">
                <input type="checkbox" ${t.completed ? 'checked' : ''} onchange="window.toggleTask('${t.id}')" style="margin-right:12px; width:18px; height:18px;">
                <span style="flex:1; ${t.completed ? 'text-decoration:line-through; color:var(--text-sub);' : ''}">${t.name} <span class="badge" style="background:#fdfaf3; border:1px solid var(--yellow); color:var(--yellow); font-size:0.7rem; margin-left:8px;">+${t.xp} XP</span></span>
                <button class="icon-btn" onclick="window.removerTask('${t.id}')" style="color:var(--text-sub);"><i class="ri-delete-bin-line"></i></button>
            </div>`;
    });
}

function renderizarHabits() {
    const cont = document.getElementById('habits-container');
    cont.innerHTML = '';
    if (userData.habits.length === 0) cont.innerHTML = '<p class="text-sub text-sm">Nenhum hábito rastreado.</p>';
    userData.habits.forEach(h => {
        cont.innerHTML += `
            <div style="display:flex; align-items:center; padding:12px; border:1px solid var(--border-color); border-radius:6px; margin-bottom:8px; background:var(--bg-main);">
                <input type="checkbox" ${h.completedToday ? 'checked' : ''} onchange="window.toggleHabit('${h.id}')" style="margin-right:12px; width:18px; height:18px;">
                <span style="flex:1; ${h.completedToday ? 'color:var(--text-sub);' : ''}">${h.name} <span class="badge" style="color:var(--orange); font-size:0.75rem; margin-left:8px;">🔥 ${h.streak} dias</span></span>
                <button class="icon-btn" onclick="window.removerHabit('${h.id}')" style="color:var(--text-sub);"><i class="ri-delete-bin-line"></i></button>
            </div>`;
    });
}

function renderizarAtividades() {
    const cont = document.getElementById('activities-container');
    cont.innerHTML = '';
    if (userData.activities.length === 0) cont.innerHTML = '<p class="text-sub text-sm">Nenhuma atividade agendada.</p>';
    userData.activities.forEach(a => {
        const dInfo = difficultyMap[a.difficulty];
        const dateStr = new Date(a.dueDate).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
        cont.innerHTML += `
            <div style="display:flex; align-items:center; padding:12px; border:1px solid var(--border-color); border-radius:6px; margin-bottom:8px; background:var(--bg-main);">
                <input type="checkbox" ${a.completed ? 'checked' : ''} onchange="window.toggleAtividade('${a.id}')" style="margin-right:12px; width:18px; height:18px;">
                <div style="flex:1; ${a.completed ? 'text-decoration:line-through; color:var(--text-sub);' : ''}">
                    <div style="font-weight:500;">${a.name} <span class="badge" style="${dInfo.colorStyle} font-size:0.7rem; padding:2px 6px; border-radius:4px; margin-left:8px;">${dInfo.label}</span></div>
                    <div style="font-size:0.75rem; color:var(--text-sub); margin-top:4px;"><i class="ri-time-line"></i> ${dateStr} • +${a.xp} XP</div>
                </div>
                <button class="icon-btn" onclick="window.removerAtividade('${a.id}')" style="color:var(--text-sub);"><i class="ri-delete-bin-line"></i></button>
            </div>`;
    });
}

// =====================================
// FUNÇÕES DE AÇÃO DO RPG
// =====================================
function adicionarHistorico(text, icon) {
    const now = new Date();
    const time = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
    userData.history.push({ id: Date.now().toString(), text, time, icon });
    if (userData.history.length > 20) userData.history.shift();
}

function darXP(xp, attrId) {
    userData.xpTotal += xp;
    userData.dailyXp += xp;
    if (attrId && attrId !== 'none') {
        const attr = userData.attributes.find(a => a.id === attrId);
        if (attr) {
            attr.xp += xp;
            attr.level = Math.floor(attr.xp / 100) + 1;
        }
    }
}

function tirarXP(xp, attrId) {
    userData.xpTotal = Math.max(0, userData.xpTotal - xp);
    userData.dailyXp = Math.max(0, userData.dailyXp - xp);
    if (attrId && attrId !== 'none') {
        const attr = userData.attributes.find(a => a.id === attrId);
        if (attr) {
            attr.xp = Math.max(0, attr.xp - xp);
            attr.level = Math.floor(attr.xp / 100) + 1;
        }
    }
}

window.toggleTask = function(id) {
    const t = userData.tasks.find(x => x.id === id);
    if (!t) return;
    t.completed = !t.completed;
    if (t.completed) {
        darXP(t.xp, t.attrId);
        adicionarHistorico(`Concluiu: ${t.name}`, "ri-check-line");
    } else {
        tirarXP(t.xp, t.attrId);
        adicionarHistorico(`Desmarcou: ${t.name}`, "ri-arrow-go-back-line");
    }
    salvarDadosRPG();
};
window.removerTask = function(id) {
    const t = userData.tasks.find(x => x.id === id);
    if (t && t.completed) tirarXP(t.xp, t.attrId);
    userData.tasks = userData.tasks.filter(x => x.id !== id);
    salvarDadosRPG();
};

window.toggleHabit = function(id) {
    const h = userData.habits.find(x => x.id === id);
    if (!h) return;
    h.completedToday = !h.completedToday;
    if (h.completedToday) {
        h.streak++;
        darXP(10, h.attrId);
        adicionarHistorico(`Hábito feito: ${h.name}`, "ri-fire-fill");
    } else {
        h.streak = Math.max(0, h.streak - 1);
        tirarXP(10, h.attrId);
        adicionarHistorico(`Desmarcou: ${h.name}`, "ri-arrow-go-back-line");
    }
    salvarDadosRPG();
};
window.removerHabit = function(id) {
    const h = userData.habits.find(x => x.id === id);
    if (h && h.completedToday) tirarXP(10, h.attrId);
    userData.habits = userData.habits.filter(x => x.id !== id);
    salvarDadosRPG();
};

window.toggleAtividade = function(id) {
    const a = userData.activities.find(x => x.id === id);
    if (!a) return;
    a.completed = !a.completed;
    if (a.completed) {
        darXP(a.xp, a.attrId);
        adicionarHistorico(`Entregou: ${a.name}`, "ri-timer-flash-line");
    } else {
        tirarXP(a.xp, a.attrId);
        adicionarHistorico(`Desmarcou entrega: ${a.name}`, "ri-arrow-go-back-line");
    }
    salvarDadosRPG();
};
window.removerAtividade = function(id) {
    const a = userData.activities.find(x => x.id === id);
    if (a && a.completed) tirarXP(a.xp, a.attrId);
    userData.activities = userData.activities.filter(x => x.id !== id);
    salvarDadosRPG();
};

window.removerAttr = function(id) {
    userData.attributes = userData.attributes.filter(x => x.id !== id);
    salvarDadosRPG();
};

// =====================================
// TRILHA DE CURSO (ESTUDAR)
// =====================================
async function carregarTrilhaDoFirestore() {
    const container = document.getElementById('semanas-container');
    try {
        const cursoRef = doc(db, "cursos", "curso_padrao");
        const docSnap = await getDoc(cursoRef);
        if (docSnap.exists() && docSnap.data().semanas) {
            container.innerHTML = '';
            docSnap.data().semanas.forEach(sem => {
                const card = document.createElement('div');
                card.className = `semana-card ${sem.liberada ? 'unlocked' : 'locked'}`;
                const statusBadge = sem.liberada ? '<span class="badge" style="background:#e5f5e0; color:var(--green);">Liberado</span>' : '<span class="badge" style="background:#fdeceb; color:var(--red);"><i class="ri-lock-line"></i> Bloqueado</span>';

                let diasHTML = '';
                if (sem.liberada && sem.dias) {
                    sem.dias.forEach(dia => {
                        if ((dia.texto && dia.texto.trim() !== "") || (dia.materiais && dia.materiais.length > 0)) {
                            let mats = '';
                            if (dia.materiais) dia.materiais.forEach(m => { mats += `<a href="${m.link}" target="_blank" style="display:block; padding:8px; border:1px solid var(--border-color); border-radius:4px; margin-top:8px; text-decoration:none; color:var(--text-main);"><i class="ri-attachment-line text-yellow"></i> ${m.nome}</a>`; });
                            diasHTML += `<div style="margin-top:16px; padding:16px; background:var(--bg-main); border-radius:4px; border-left:3px solid var(--yellow);"><h5 style="margin-bottom:8px; color:var(--text-main);"><i class="ri-calendar-check-line text-yellow"></i> ${dia.nome}</h5><p style="font-size:0.85rem; color:var(--text-sub);">${dia.texto}</p>${mats}</div>`;
                        }
                    });
                }
                card.innerHTML = `<div class="semana-header" onclick="if(${sem.liberada}) this.parentElement.classList.toggle('open')" style="padding:16px; border-bottom:1px solid var(--border-color); cursor:pointer; display:flex; justify-content:space-between; align-items:center;">
                    <span class="font-medium"><i class="ri-arrow-right-s-line toggle-icon"></i> ${sem.titulo}</span>${statusBadge}</div>
                    <div class="semana-body" style="display:none; padding:16px; background:var(--bg-sidebar);">${diasHTML === '' && sem.liberada ? '<p class="text-sub text-sm">Nenhum conteúdo adicionado.</p>' : diasHTML}</div>`;
                container.appendChild(card);
            });
        }
    } catch (e) { container.innerHTML = '<p class="text-red">Erro ao carregar trilha.</p>'; }
}

// =====================================
// SALA DE ESTUDOS (ESTUDAR + XP)
// =====================================
function renderSubjectSelect() {
    const select = document.getElementById('timer-subject-select');
    let options = '<option value="" disabled selected>Selecione a matéria...</option><option value="Geral">Estudo Geral</option>';
    subjects.forEach(sub => { options += `<option value="${sub.name}">${sub.name}</option>`; });
    select.innerHTML = options;
}

let streakMultiplier = 1.0;

function atualizarEstatisticasEstudos() {
    const subjectData = {};
    const subjectColors = {};
    let totalMinutes = 0;
    let minutesToday = 0;
    const todayStr = new Date().toDateString();

    studySessions.forEach(s => {
        if (!subjectData[s.subject]) {
            subjectData[s.subject] = 0;
            subjectColors[s.subject] = s.subjectColor || '#8B6508';
        }
        subjectData[s.subject] += s.duration;
        totalMinutes += s.duration;
        if (new Date(s.timestamp).toDateString() === todayStr) minutesToday += s.duration;
    });

    document.getElementById('total-study-time').innerText = `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
    const goalPercent = Math.min((minutesToday / userData.dailyStudyGoal) * 100, 100);
    document.getElementById('goal-progress-bar').style.width = `${goalPercent}%`;

    const canvas = document.getElementById('studyChart');
    if (studyChartInstance) studyChartInstance.destroy();
    studyChartInstance = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: { labels: Object.keys(subjectData).length > 0 ? Object.keys(subjectData) : ['Nenhum dado'], datasets: [{ data: Object.keys(subjectData).length > 0 ? Object.values(subjectData) : [0], backgroundColor: Object.keys(subjectData).length > 0 ? Object.keys(subjectData).map(k => subjectColors[k]) : ['#e9e9e7'], borderRadius: 4 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });

    // Calcular Ofensiva
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const studiedDays = new Set(studySessions.map(s => {
        const d = new Date(s.timestamp);
        d.setHours(0, 0, 0, 0);
        return d.getTime();
    }));
    let streakCount = 0;
    let checkDate = new Date(today.getTime());
    if (!studiedDays.has(checkDate.getTime())) checkDate.setDate(checkDate.getDate() - 1);
    while (studiedDays.has(checkDate.getTime())) {
        streakCount++;
        checkDate.setDate(checkDate.getDate() - 1);
    }

    document.getElementById('streak-count').innerText = streakCount;
    streakMultiplier = Math.min(2.0, 1.0 + (streakCount * 0.05));
    document.getElementById('streak-multiplier-text').innerText = `${streakMultiplier.toFixed(2)}x XP`;

    const streakCont = document.getElementById('streak-days-container');
    streakCont.innerHTML = '';
    const dayNames = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
    for (let i = 6; i >= 0; i--) {
        const d = new Date(today.getTime());
        d.setDate(d.getDate() - i);
        const isStudied = studiedDays.has(d.getTime());
        streakCont.innerHTML += `<div style="flex:1; aspect-ratio:1; display:flex; align-items:center; justify-content:center; border-radius:4px; border:1px solid ${isStudied ? '#0f7b6c' : 'var(--border-color)'}; background:${isStudied ? '#e5f5e0' : 'var(--bg-main)'}; color:${isStudied ? '#0f7b6c' : 'var(--text-sub)'}; font-size:0.7rem; font-weight:${isStudied ? 'bold' : 'normal'};">${isStudied ? '<i class="ri-check-line"></i>' : dayNames[d.getDay()]}</div>`;
    }
}

// Timer Logic
let timerInterval = null,
    timerSeconds = 0,
    currentTimerMode = 'stopwatch',
    countdownTotalSeconds = 0,
    isTimerRunning = false;

function iniciarSalaDeEstudos() {
    const btnPlay = document.getElementById('btn-timer-play');
    const btnPause = document.getElementById('btn-timer-pause');
    const btnStop = document.getElementById('btn-timer-stop');
    const display = document.getElementById('timer-display');
    const subjectSelect = document.getElementById('timer-subject-select');

    document.getElementById('tab-stopwatch').addEventListener('click', (e) => {
        currentTimerMode = 'stopwatch';
        e.target.classList.add('active');
        document.getElementById('tab-countdown').classList.remove('active');
        document.getElementById('countdown-setup').style.display = 'none';
        resetTimerUI();
    });
    document.getElementById('tab-countdown').addEventListener('click', (e) => {
        currentTimerMode = 'countdown';
        e.target.classList.add('active');
        document.getElementById('tab-stopwatch').classList.remove('active');
        document.getElementById('countdown-setup').style.display = 'block';
        resetTimerUI();
    });

    async function finishSession(mins, subjName) {
        if (mins >= 1) {
            const subjectObj = subjects.find(s => s.name === subjName);
            const color = subjectObj ? subjectObj.color : '#8B6508';
            const xpGained = Math.floor(mins * streakMultiplier);

            const novaSessao = { subject: subjName, subjectColor: color, duration: mins, timestamp: Date.now() };
            try {
                await addDoc(collection(db, "users", currentUser.uid, "studySessions"), novaSessao);
                studySessions.unshift(novaSessao);
                darXP(xpGained, 'none');
                adicionarHistorico(`Estudou ${subjName} (${mins}m) +${xpGained}XP`, "ri-book-read-line");
                await salvarDadosRPG();
                alert(`Sessão concluída! +${xpGained} XP 🔥`);
            } catch (e) { console.error(e); }
        }
        resetTimerUI();
    }

    function resetTimerUI() {
        timerSeconds = 0;
        countdownTotalSeconds = 0;
        display.innerText = "00:00:00";
        btnPlay.style.display = 'block';
        btnPause.style.display = 'none';
        btnStop.style.display = 'none';
        subjectSelect.disabled = false;
    }

    function updateDisplay() { display.innerText = `${String(Math.floor(timerSeconds/3600)).padStart(2,'0')}:${String(Math.floor((timerSeconds%3600)/60)).padStart(2,'0')}:${String(timerSeconds%60).padStart(2,'0')}`; }

    btnPlay.addEventListener('click', () => {
        if (!subjectSelect.value) return alert('Selecione uma matéria.');
        if (currentTimerMode === 'countdown' && timerSeconds === 0) {
            const m = parseInt(document.getElementById('countdown-input-minutes').value);
            if (!m || m <= 0) return alert('Insira os minutos.');
            countdownTotalSeconds = m * 60;
            timerSeconds = countdownTotalSeconds;
        }
        isTimerRunning = true;
        subjectSelect.disabled = true;
        btnPlay.style.display = 'none';
        btnPause.style.display = 'block';
        btnStop.style.display = 'block';

        timerInterval = setInterval(() => {
            if (currentTimerMode === 'stopwatch') {
                timerSeconds++;
                updateDisplay();
            } else {
                timerSeconds--;
                updateDisplay();
                if (timerSeconds <= 0) {
                    clearInterval(timerInterval);
                    isTimerRunning = false;
                    finishSession(Math.floor(countdownTotalSeconds / 60), subjectSelect.value);
                }
            }
        }, 1000);
    });

    btnPause.addEventListener('click', () => {
        clearInterval(timerInterval);
        isTimerRunning = false;
        btnPlay.style.display = 'block';
        btnPause.style.display = 'none';
    });
    btnStop.addEventListener('click', () => {
        clearInterval(timerInterval);
        isTimerRunning = false;
        finishSession(currentTimerMode === 'stopwatch' ? Math.floor(timerSeconds / 60) : Math.floor((countdownTotalSeconds - timerSeconds) / 60), subjectSelect.value);
    });
}

// =====================================
// MODAIS
// =====================================
function setupModals() {
    const abres = { 'btn-new-subject': 'modal-subject', 'btn-edit-study-goal': 'modal-study-goal', 'btn-open-attr': 'modal-attr', 'btn-open-task': 'modal-task', 'btn-open-habit': 'modal-habit', 'btn-open-activity': 'modal-activity', 'btn-open-log': 'modal-log' };

    Object.keys(abres).forEach(btn => { if (document.getElementById(btn)) document.getElementById(btn).addEventListener('click', () => document.getElementById(abres[btn]).classList.add('active')); });
    document.querySelectorAll('.close-modal').forEach(btn => btn.addEventListener('click', () => document.querySelectorAll('.modal-overlay').forEach(m => {
        m.classList.remove('active');
        m.querySelectorAll('input').forEach(i => i.value = '');
    })));
    document.getElementById('btn-clear-history').addEventListener('click', () => {
        if (confirm("Apagar histórico?")) {
            userData.history = [];
            salvarDadosRPG();
        }
    });

    // Salvar Modais
    document.getElementById('save-subject').addEventListener('click', async() => {
        const name = document.getElementById('input-subject-name').value;
        const color = document.getElementById('input-subject-color').value;
        if (name) {
            try {
                const ref = await addDoc(collection(db, "users", currentUser.uid, "subjects"), { name, color });
                subjects.push({ id: ref.id, name, color });
                renderSubjectSelect();
                document.querySelector('#modal-subject .close-modal').click();
            } catch (e) {}
        }
    });
    document.getElementById('save-study-goal').addEventListener('click', () => {
        const goal = parseInt(document.getElementById('input-study-goal').value);
        if (goal) {
            userData.dailyStudyGoal = goal;
            salvarDadosRPG();
            document.querySelector('#modal-study-goal .close-modal').click();
        }
    });
    document.getElementById('save-attr').addEventListener('click', () => {
        const n = document.getElementById('input-attr-name').value;
        if (n) {
            userData.attributes.push({ id: 'att_' + Date.now(), name: n, xp: 0, level: 1 });
            adicionarHistorico(`Atributo: ${n}`, "ri-medal-line");
            salvarDadosRPG();
            document.querySelector('#modal-attr .close-modal').click();
        }
    });
    document.getElementById('save-task').addEventListener('click', () => {
        const n = document.getElementById('input-task-name').value;
        const xp = parseInt(document.getElementById('input-task-xp').value);
        const a = document.getElementById('input-task-attr').value;
        if (n && xp) {
            userData.tasks.push({ id: 't_' + Date.now(), name: n, xp: xp, attrId: a, completed: false });
            adicionarHistorico(`Nova Missão: ${n}`, "ri-add-line");
            salvarDadosRPG();
            document.querySelector('#modal-task .close-modal').click();
        }
    });
    document.getElementById('save-habit').addEventListener('click', () => {
        const n = document.getElementById('input-habit-name').value;
        const a = document.getElementById('input-habit-attr').value;
        if (n) {
            userData.habits.push({ id: 'h_' + Date.now(), name: n, attrId: a, streak: 0, completedToday: false });
            adicionarHistorico(`Novo Hábito: ${n}`, "ri-loop-left-line");
            salvarDadosRPG();
            document.querySelector('#modal-habit .close-modal').click();
        }
    });
    document.getElementById('save-activity').addEventListener('click', () => {
        const n = document.getElementById('input-act-name').value;
        const d = document.getElementById('input-act-date').value;
        const diff = document.getElementById('input-act-diff').value;
        const a = document.getElementById('input-act-attr').value;
        if (n && d && diff) {
            userData.activities.push({ id: 'a_' + Date.now(), name: n, dueDate: new Date(d).getTime(), difficulty: diff, attrId: a, xp: difficultyMap[diff].xp, completed: false });
            adicionarHistorico(`Agendou: ${n}`, "ri-timer-line");
            salvarDadosRPG();
            document.querySelector('#modal-activity .close-modal').click();
        }
    });
    document.getElementById('save-log').addEventListener('click', () => {
        const d = document.getElementById('input-log-desc').value;
        if (d) {
            adicionarHistorico(d, "ri-edit-line");
            salvarDadosRPG();
            document.querySelector('#modal-log .close-modal').click();
        }
    });
}
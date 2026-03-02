// ARQUIVO: js/aluno.js
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc, updateDoc, collection, addDoc, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let currentUser = null;
let userData = { xpTotal: 0, dailyStudyGoal: 60 };
let studySessions = [];
let subjects = [];
let studyChartInstance = null;

document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async (user) => {
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

async function carregarDadosUsuario(uid) {
    try {
        const docRef = doc(db, "users", uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            userData = docSnap.data();
            if(!userData.xpTotal) userData.xpTotal = 0;
            if(!userData.dailyStudyGoal) userData.dailyStudyGoal = 60;
            
            document.getElementById('aluno-nome').innerText = userData.nome;
            document.getElementById('aluno-nivel').innerText = `Lvl ${Math.floor(userData.xpTotal / 1000) + 1} • XP: ${userData.xpTotal}`;
            
            // Carregar Sessões
            const q = query(collection(db, "users", uid, "studySessions"), orderBy("timestamp", "desc"));
            const sessionSnaps = await getDocs(q);
            studySessions = [];
            sessionSnaps.forEach(d => studySessions.push(d.data()));

            // Carregar Matérias
            const subSnaps = await getDocs(collection(db, "users", uid, "subjects"));
            subjects = [];
            subSnaps.forEach(d => subjects.push({id: d.id, ...d.data()}));
            
            atualizarEstatisticas();
            renderSubjectSelect();
        }
    } catch (e) {
        console.error("Erro ao carregar perfil:", e);
    }
}

async function carregarTrilhaDoFirestore() {
    const container = document.getElementById('semanas-container');
    try {
        const cursoRef = doc(db, "cursos", "curso_padrao");
        const docSnap = await getDoc(cursoRef);
        if (docSnap.exists() && docSnap.data().semanas) {
            renderizarSemanas(docSnap.data().semanas);
        } else {
            container.innerHTML = '<p class="text-sub">Nenhum módulo disponível.</p>';
        }
    } catch (e) {
        container.innerHTML = '<p class="text-red">Erro ao carregar trilha.</p>';
    }
}

function renderizarSemanas(bancoSemanas) {
    const container = document.getElementById('semanas-container');
    container.innerHTML = '';
    
    bancoSemanas.forEach(sem => {
        const card = document.createElement('div');
        card.className = `semana-card ${sem.liberada ? 'unlocked' : 'locked'}`;
        const statusBadge = sem.liberada ? '<span class="badge badge-unlocked">Liberado</span>' : '<span class="badge badge-locked"><i class="ri-lock-line"></i> Bloqueado</span>';
        
        let diasHTML = '';
        if (sem.liberada && sem.dias) {
            sem.dias.forEach(dia => {
                // Renderiza o dia APENAS se tiver algum texto escrito ou algum material anexado
                if((dia.texto && dia.texto.trim() !== "") || (dia.materiais && dia.materiais.length > 0)) {
                    let materiaisHTML = '';
                    if (dia.materiais) {
                        dia.materiais.forEach(mat => {
                            const icon = mat.tipo === 'pdf' ? 'ri-file-pdf-line' : 'ri-play-circle-line';
                            materiaisHTML += `<a href="${mat.link}" target="_blank" class="notion-item" style="border: 1px solid var(--border-color); margin-top: 8px;"><i class="${icon}"></i> ${mat.nome}</a>`;
                        });
                    }
                    
                    diasHTML += `
                        <div class="dia-aluno-block" style="margin-top: 16px; padding: 16px; background: var(--bg-main); border-radius: var(--radius-sm); border-left: 3px solid var(--yellow); box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
                            <h5 style="margin-bottom: 8px; color: var(--text-main); font-size: 0.95rem; display: flex; align-items: center; gap: 8px;">
                                <i class="ri-calendar-check-line text-yellow"></i> ${dia.nome}
                            </h5>
                            ${dia.texto ? `<p class="text-sub text-sm" style="margin-bottom: 12px; white-space: pre-wrap;">${dia.texto}</p>` : ''}
                            ${materiaisHTML}
                        </div>
                    `;
                }
            });
        }

        card.innerHTML = `
            <div class="semana-header" onclick="if(${sem.liberada}) this.parentElement.classList.toggle('open')">
                <div class="flex-between" style="width: 100%;">
                    <span class="font-medium"><i class="ri-arrow-right-s-line toggle-icon"></i> ${sem.titulo || `Semana ${sem.numero.toString().padStart(2, '0')}`}</span>
                    ${statusBadge}
                </div>
            </div>
            <div class="semana-body" style="background: var(--bg-sidebar);">
                ${diasHTML === '' && sem.liberada ? '<p class="text-sub text-sm" style="padding-top: 12px;">Nenhum conteúdo adicionado nesta semana ainda.</p>' : diasHTML}
            </div>`;
        container.appendChild(card);
    });
}

function renderSubjectSelect() {
    const select = document.getElementById('timer-subject-select');
    let options = '<option value="" disabled selected>Selecione a matéria...</option>';
    options += '<option value="Geral">Estudo Geral</option>';
    subjects.forEach(sub => {
        options += `<option value="${sub.name}">${sub.name}</option>`;
    });
    select.innerHTML = options;
}

function atualizarEstatisticas() {
    const subjectData = {};
    const subjectColors = {};
    let totalMinutes = 0;
    let minutesToday = 0;
    
    const todayStr = new Date().toDateString();

    studySessions.forEach(session => {
        if (!subjectData[session.subject]) {
            subjectData[session.subject] = 0;
            subjectColors[session.subject] = session.subjectColor || '#8B6508';
        }
        subjectData[session.subject] += session.duration;
        totalMinutes += session.duration;
        
        // Verifica se estudou hoje
        const sessionDate = new Date(session.timestamp).toDateString();
        if(sessionDate === todayStr) minutesToday += session.duration;
    });

    // Atualiza Metas e Tempos
    document.getElementById('total-study-time').innerText = `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
    document.getElementById('daily-study-goal-display').innerText = `${Math.floor(userData.dailyStudyGoal / 60)}h ${userData.dailyStudyGoal % 60}m`;
    
    const goalPercent = Math.min((minutesToday / userData.dailyStudyGoal) * 100, 100);
    document.getElementById('goal-progress-bar').style.width = `${goalPercent}%`;

    // Gráfico Chart.js
    const canvas = document.getElementById('studyChart');
    if (studyChartInstance) studyChartInstance.destroy();
    
    studyChartInstance = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: Object.keys(subjectData).length > 0 ? Object.keys(subjectData) : ['Nenhum dado'],
            datasets: [{ 
                label: 'Minutos', 
                data: Object.keys(subjectData).length > 0 ? Object.values(subjectData) : [0], 
                backgroundColor: Object.keys(subjectData).length > 0 ? Object.keys(subjectData).map(k => subjectColors[k]) : ['#e9e9e7'], 
                borderRadius: 4 
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });

    calcularOfensiva();
}

let streakMultiplier = 1.0;

function calcularOfensiva() {
    const today = new Date(); today.setHours(0,0,0,0);
    const studiedDays = new Set(studySessions.map(session => {
        const d = new Date(session.timestamp); d.setHours(0,0,0,0); return d.getTime();
    }));

    let streakCount = 0;
    let checkDate = new Date(today.getTime());
    if (!studiedDays.has(checkDate.getTime())) checkDate.setDate(checkDate.getDate() - 1);
    
    while(studiedDays.has(checkDate.getTime())) {
        streakCount++;
        checkDate.setDate(checkDate.getDate() - 1);
    }
    document.getElementById('streak-count').innerText = streakCount;

    streakMultiplier = 1.0 + (streakCount * 0.05);
    if (streakMultiplier > 2.0) streakMultiplier = 2.0; 
    document.getElementById('streak-multiplier-text').innerText = `${streakMultiplier.toFixed(2)}x XP`;

    const streakContainer = document.getElementById('streak-days-container');
    streakContainer.innerHTML = '';
    const dayNames = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
    for (let i = 6; i >= 0; i--) {
        const d = new Date(today.getTime()); d.setDate(d.getDate() - i);
        const isStudied = studiedDays.has(d.getTime());
        const div = document.createElement('div');
        div.className = `streak-day ${isStudied ? 'active' : ''}`;
        div.innerText = dayNames[d.getDay()];
        if(isStudied) div.innerHTML = `<i class="ri-check-line"></i>`;
        streakContainer.appendChild(div);
    }
}

// =====================================
// LÓGICA DO CRONÔMETRO E TEMPORIZADOR
// =====================================
let timerInterval = null, timerSeconds = 0, currentTimerMode = 'stopwatch', countdownTotalSeconds = 0, isTimerRunning = false;

function iniciarSalaDeEstudos() {
    const btnPlay = document.getElementById('btn-timer-play');
    const btnPause = document.getElementById('btn-timer-pause');
    const btnStop = document.getElementById('btn-timer-stop');
    const display = document.getElementById('timer-display');
    const subjectSelect = document.getElementById('timer-subject-select');
    
    document.getElementById('tab-stopwatch').addEventListener('click', (e) => setTimerMode('stopwatch', e.target));
    document.getElementById('tab-countdown').addEventListener('click', (e) => setTimerMode('countdown', e.target));

    function setTimerMode(mode, btn) {
        if(isTimerRunning) return alert("Pause o relógio antes de trocar.");
        currentTimerMode = mode;
        document.querySelectorAll('.timer-tab').forEach(t => t.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('countdown-setup').style.display = mode === 'countdown' ? 'block' : 'none';
        resetTimerUI();
    }

    async function finishSession(minutesStudied, subjectName) {
        if (minutesStudied >= 1) {
            const subjectObj = subjects.find(s => s.name === subjectName);
            const color = subjectObj ? subjectObj.color : '#8B6508';
            const xpGained = Math.floor(minutesStudied * streakMultiplier);

            const novaSessao = { subject: subjectName, subjectColor: color, duration: minutesStudied, timestamp: Date.now() };
            
            try {
                await addDoc(collection(db, "users", currentUser.uid, "studySessions"), novaSessao);
                userData.xpTotal += xpGained;
                await updateDoc(doc(db, "users", currentUser.uid), { xpTotal: userData.xpTotal });
                
                studySessions.unshift(novaSessao);
                atualizarEstatisticas();
                document.getElementById('aluno-nivel').innerText = `Lvl ${Math.floor(userData.xpTotal / 1000) + 1} • XP: ${userData.xpTotal}`;
                alert(`Sessão salva! +${xpGained} XP 🔥`);
            } catch(e) { console.error(e); alert("Erro ao salvar progresso."); }
        }
        resetTimerUI();
    }

    function resetTimerUI() {
        timerSeconds = 0; countdownTotalSeconds = 0; display.innerText = "00:00:00";
        btnPlay.style.display = 'block'; btnPause.style.display = 'none'; btnStop.style.display = 'none';
        subjectSelect.disabled = false;
    }

    function updateDisplay() {
        display.innerText = `${String(Math.floor(timerSeconds/3600)).padStart(2,'0')}:${String(Math.floor((timerSeconds%3600)/60)).padStart(2,'0')}:${String(timerSeconds%60).padStart(2,'0')}`;
    }

    btnPlay.addEventListener('click', () => {
        if (!subjectSelect.value) return alert('Selecione uma matéria.');
        
        if (currentTimerMode === 'countdown' && timerSeconds === 0) {
            const mins = parseInt(document.getElementById('countdown-input-minutes').value);
            if(!mins || mins <= 0) return alert('Insira os minutos.');
            countdownTotalSeconds = mins * 60; timerSeconds = countdownTotalSeconds;
        }

        isTimerRunning = true; subjectSelect.disabled = true;
        btnPlay.style.display = 'none'; btnPause.style.display = 'block'; btnStop.style.display = 'block';
        
        timerInterval = setInterval(() => {
            if(currentTimerMode === 'stopwatch') {
                timerSeconds++; updateDisplay();
            } else {
                timerSeconds--; updateDisplay();
                if(timerSeconds <= 0) {
                    clearInterval(timerInterval); isTimerRunning = false;
                    finishSession(Math.floor(countdownTotalSeconds / 60), subjectSelect.value);
                }
            }
        }, 1000);
    });

    btnPause.addEventListener('click', () => { clearInterval(timerInterval); isTimerRunning = false; btnPlay.style.display = 'block'; btnPause.style.display = 'none'; });
    
    btnStop.addEventListener('click', () => {
        clearInterval(timerInterval); isTimerRunning = false;
        let mins = currentTimerMode === 'stopwatch' ? Math.floor(timerSeconds / 60) : Math.floor((countdownTotalSeconds - timerSeconds) / 60);
        finishSession(mins, subjectSelect.value);
    });
}

function setupModals() {
    // Modal Nova Matéria
    document.getElementById('btn-new-subject').addEventListener('click', () => document.getElementById('modal-subject').classList.add('active'));
    document.getElementById('save-subject').addEventListener('click', async () => {
        const name = document.getElementById('input-subject-name').value.trim();
        const color = document.getElementById('input-subject-color').value;
        if(!name) return alert("Digite um nome.");
        
        try {
            const docRef = await addDoc(collection(db, "users", currentUser.uid, "subjects"), { name, color });
            subjects.push({ id: docRef.id, name, color });
            renderSubjectSelect();
            document.getElementById('modal-subject').classList.remove('active');
        } catch(e) { alert("Erro ao salvar matéria."); }
    });

    // Modal Editar Meta
    document.getElementById('btn-edit-study-goal').addEventListener('click', () => {
        document.getElementById('input-study-goal').value = userData.dailyStudyGoal;
        document.getElementById('modal-study-goal').classList.add('active');
    });
    document.getElementById('save-study-goal').addEventListener('click', async () => {
        const goal = parseInt(document.getElementById('input-study-goal').value);
        if(!goal || goal <= 0) return alert("Meta inválida.");
        try {
            await updateDoc(doc(db, "users", currentUser.uid), { dailyStudyGoal: goal });
            userData.dailyStudyGoal = goal;
            atualizarEstatisticas();
            document.getElementById('modal-study-goal').classList.remove('active');
        } catch(e) { alert("Erro ao salvar meta."); }
    });

    // Fechar Modais
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', () => document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active')));
    });
}
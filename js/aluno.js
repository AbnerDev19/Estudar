// ARQUIVO: js/aluno.js
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc, setDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let currentUser = null;
let userData = { xpTotal: 0, studySessions: [] };
let studyChartInstance = null;

// --- 1. Inicialização e Autenticação ---
document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            await carregarDadosUsuario(user.uid);
            await carregarTrilhaDeAulas();
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
    const docRef = doc(db, "users", uid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        userData = { ...userData, ...docSnap.data() };
        if(!userData.studySessions) userData.studySessions = [];
        if(!userData.xpTotal) userData.xpTotal = 0;
        
        document.getElementById('aluno-nome').innerText = userData.nome;
        const level = Math.floor(userData.xpTotal / 1000) + 1;
        document.getElementById('aluno-nivel').innerText = `Lvl ${level} • XP: ${userData.xpTotal}`;
        
        atualizarGraficoEstudos();
    }
}

// --- 2. Trilha de Aulas (Semanas 00 a 12) ---
async function carregarTrilhaDeAulas() {
    const container = document.getElementById('semanas-container');
    container.innerHTML = '';

    // No futuro, isso virá da coleção global do Professor no Firebase: collection(db, "turmas", "ID_TURMA", "semanas")
    // Aqui criamos a estrutura "forma final" que mapeia 13 semanas dinamicamente.
    
    // Simulação do retorno do Firebase (Você pode plugar o getDocs aqui depois)
    const bancoSemanas = []; 
    for(let i = 0; i <= 12; i++) {
        // Exemplo: O professor só liberou a semana 00 e 01. O resto está bloqueado.
        const isLiberada = i <= 1; 
        
        bancoSemanas.push({
            id: `sem_${i}`,
            numero: i,
            titulo: i === 0 ? "Semana 00: Boas Vindas e Nivelamento" : `Semana ${i.toString().padStart(2, '0')}: Conteúdo Oficial`,
            liberada: isLiberada,
            materiais: isLiberada ? [
                { tipo: 'pdf', nome: 'Material de Apoio.pdf', link: '#' },
                { tipo: 'video', nome: 'Aula Magna.mp4', link: '#' }
            ] : [],
            texto: isLiberada ? "Leia o material com atenção antes de iniciar as atividades." : ""
        });
    }

    // Renderização no HTML
    bancoSemanas.forEach(sem => {
        const card = document.createElement('div');
        card.className = `semana-card ${sem.liberada ? 'unlocked' : 'locked'}`;
        
        const statusHTML = sem.liberada ? '<span class="semana-status"><i class="ri-unlock-line"></i> Liberado</span>' : '<span class="semana-status"><i class="ri-lock-line"></i> Bloqueado</span>';
        
        let materiaisHTML = '';
        if (sem.liberada && sem.materiais.length > 0) {
            sem.materiais.forEach(mat => {
                const icon = mat.tipo === 'pdf' ? 'ri-file-pdf-line' : 'ri-play-circle-line';
                materiaisHTML += `<a href="${mat.link}" target="_blank" class="material-item"><i class="${icon}"></i> ${mat.nome}</a>`;
            });
        }

        card.innerHTML = `
            <div class="semana-header" onclick="if(${sem.liberada}) this.parentElement.classList.toggle('open')">
                <div class="semana-title">Semana ${sem.numero.toString().padStart(2, '0')}</div>
                ${statusHTML}
            </div>
            <div class="semana-body">
                <h4 style="margin-bottom:8px; font-size:0.95rem;">${sem.titulo}</h4>
                <p class="text-sub" style="margin-bottom: 16px;">${sem.texto}</p>
                <div class="materiais-lista">${materiaisHTML}</div>
            </div>
        `;
        container.appendChild(card);
    });
}

// --- 3. Lógica da Sala de Estudos (Adaptado do MyLife) ---
let timerInterval = null;
let timerSeconds = 0;
let isTimerRunning = false;
let currentTimerMode = 'stopwatch';
let countdownTotalSeconds = 0;

function iniciarSalaDeEstudos() {
    const btnPlay = document.getElementById('btn-timer-play');
    const btnPause = document.getElementById('btn-timer-pause');
    const btnStop = document.getElementById('btn-timer-stop');
    const display = document.getElementById('timer-display');
    const tabStopwatch = document.getElementById('tab-stopwatch');
    const tabCountdown = document.getElementById('tab-countdown');
    const countdownSetup = document.getElementById('countdown-setup');
    const countdownInput = document.getElementById('countdown-input-minutes');
    const subjectSelect = document.getElementById('timer-subject-select');

    function formatTime(totalSeconds) {
        const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
        const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
        const s = String(totalSeconds % 60).padStart(2, '0');
        return `${h}:${m}:${s}`;
    }

    function resetTimerUI() {
        timerSeconds = 0; countdownTotalSeconds = 0; display.innerText = "00:00:00";
        btnPlay.style.display = 'block'; btnPause.style.display = 'none'; btnStop.style.display = 'none';
        countdownInput.disabled = false; subjectSelect.disabled = false;
    }

    async function finishSession(minutesStudied, subjectName) {
        if (minutesStudied >= 1) {
            // Salva na memória
            const xpGained = minutesStudied; // 1 min = 1 XP
            userData.studySessions.push({
                subject: subjectName,
                duration: minutesStudied,
                timestamp: Date.now()
            });
            userData.xpTotal += xpGained;

            // Salva no Firebase para o Professor poder ver!
            try {
                await setDoc(doc(db, "users", currentUser.uid), {
                    xpTotal: userData.xpTotal,
                    studySessions: userData.studySessions
                }, { merge: true });
                
                // Atualiza a UI visual
                document.getElementById('aluno-nivel').innerText = `Lvl ${Math.floor(userData.xpTotal/1000)+1} • XP: ${userData.xpTotal}`;
                atualizarGraficoEstudos();
                alert(`Sessão salva! +${xpGained} XP adquiridos.`);
            } catch(e) { console.error("Erro ao salvar sessão", e); }
        } else {
            alert('Tempo muito curto para gerar XP (Mínimo 1 minuto).');
        }
        resetTimerUI();
    }

    // --- Controles das Abas ---
    tabStopwatch.addEventListener('click', () => {
        if (isTimerRunning) return alert("Pause o relógio primeiro.");
        currentTimerMode = 'stopwatch';
        tabStopwatch.classList.add('active'); tabCountdown.classList.remove('active');
        countdownSetup.style.display = 'none'; resetTimerUI();
    });

    tabCountdown.addEventListener('click', () => {
        if (isTimerRunning) return alert("Pause o relógio primeiro.");
        currentTimerMode = 'countdown';
        tabCountdown.classList.add('active'); tabStopwatch.classList.remove('active');
        countdownSetup.style.display = 'block'; resetTimerUI();
    });

    // --- Controles do Relógio ---
    btnPlay.addEventListener('click', () => {
        if (currentTimerMode === 'countdown' && timerSeconds === 0) {
            const mins = parseInt(countdownInput.value);
            if (!mins || mins <= 0) return alert('Insira um tempo válido.');
            countdownTotalSeconds = mins * 60;
            timerSeconds = countdownTotalSeconds;
        }

        isTimerRunning = true;
        btnPlay.style.display = 'none'; btnPause.style.display = 'block'; btnStop.style.display = 'block';
        countdownInput.disabled = true; subjectSelect.disabled = true;

        timerInterval = setInterval(() => {
            if (currentTimerMode === 'stopwatch') {
                timerSeconds++;
                display.innerText = formatTime(timerSeconds);
            } else {
                timerSeconds--;
                display.innerText = formatTime(timerSeconds);
                if (timerSeconds <= 0) {
                    clearInterval(timerInterval); isTimerRunning = false;
                    finishSession(Math.floor(countdownTotalSeconds / 60), subjectSelect.value);
                }
            }
        }, 1000);
    });

    btnPause.addEventListener('click', () => {
        isTimerRunning = false; clearInterval(timerInterval);
        btnPlay.style.display = 'block'; btnPause.style.display = 'none';
    });

    btnStop.addEventListener('click', () => {
        isTimerRunning = false; clearInterval(timerInterval);
        let minutesStudied = currentTimerMode === 'stopwatch' ? Math.floor(timerSeconds / 60) : Math.floor((countdownTotalSeconds - timerSeconds) / 60);
        finishSession(minutesStudied, subjectSelect.value);
    });
}

function atualizarGraficoEstudos() {
    let totalMinutes = 0;
    const subjectData = {};

    userData.studySessions.forEach(session => {
        if (!subjectData[session.subject]) subjectData[session.subject] = 0;
        subjectData[session.subject] += session.duration;
        totalMinutes += session.duration;
    });

    // Atualiza Totais
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    document.getElementById('total-study-time').innerText = `${hours}h ${mins}m`;

    // Atualiza Ofensiva (Streak)
    const today = new Date(); today.setHours(0,0,0,0);
    const studiedDays = new Set(userData.studySessions.map(s => new Date(s.timestamp).setHours(0,0,0,0)));
    document.getElementById('streak-count').innerText = studiedDays.size; // Simplificação para contar dias únicos de estudo

    // Desenha Gráfico Chart.js
    const canvas = document.getElementById('studyChart');
    if (!canvas) return;

    if (studyChartInstance) studyChartInstance.destroy();
    
    Chart.defaults.color = '#787774';
    Chart.defaults.font.family = "'Inter', sans-serif";

    studyChartInstance = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: Object.keys(subjectData).length > 0 ? Object.keys(subjectData) : ['Sem dados'],
            datasets: [{
                label: 'Minutos Estudados',
                data: Object.keys(subjectData).length > 0 ? Object.values(subjectData) : [0],
                backgroundColor: '#b45309', // Amarelo escuro da identidade
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, grid: { color: '#e9e9e7' } }, x: { grid: { display: false } } }
        }
    });
}
// Substitua esta parte no seu js/aluno.js
function renderizarSemanas(bancoSemanas) {
    const container = document.getElementById('semanas-container');
    container.innerHTML = '';

    bancoSemanas.forEach(sem => {
        const card = document.createElement('div');
        card.className = `semana-card ${sem.liberada ? 'unlocked' : 'locked'}`;
        
        const statusBadge = sem.liberada 
            ? '<span class="badge badge-unlocked">Liberado</span>' 
            : '<span class="badge badge-locked"><i class="ri-lock-line"></i> Bloqueado</span>';
        
        let materiaisHTML = '';
        if (sem.liberada && sem.materiais.length > 0) {
            sem.materiais.forEach(mat => {
                const icon = mat.tipo === 'pdf' ? 'ri-file-pdf-line' : 'ri-play-circle-line';
                materiaisHTML += `
                    <a href="${mat.link}" target="_blank" class="notion-item">
                        <i class="${icon}"></i> ${mat.nome}
                    </a>`;
            });
        }

        card.innerHTML = `
            <div class="semana-header" onclick="if(${sem.liberada}) this.parentElement.classList.toggle('open')">
                <div class="flex-between" style="width: 100%;">
                    <span class="font-medium" style="display:flex; align-items:center;">
                        <i class="ri-arrow-right-s-line toggle-icon"></i> Semana ${sem.numero.toString().padStart(2, '0')}
                    </span>
                    ${statusBadge}
                </div>
            </div>
            <div class="semana-body">
                <h4 style="margin-bottom:4px; font-size:0.95rem;">${sem.titulo}</h4>
                <p class="text-sub text-sm" style="margin-bottom: 12px;">${sem.texto}</p>
                ${materiaisHTML}
            </div>
        `;
        container.appendChild(card);
    });
}
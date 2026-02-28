import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc, updateDoc, collection, addDoc, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let currentUser = null;
let userData = { xpTotal: 0 };
let studySessions = [];
let studyChartInstance = null;

// UI Helper: Toast Notification
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.style.cssText = `position: fixed; bottom: 20px; right: 20px; background: ${type === 'success' ? 'var(--green)' : 'var(--red)'}; color: white; padding: 12px 24px; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 9999; animation: fadeIn 0.3s; font-size: 0.9rem; font-weight: 500;`;
    toast.innerText = message;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
}

document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            await carregarDadosUsuario(user.uid);
            await carregarTrilhaDoFirestore();
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
        userData = docSnap.data();
        if(!userData.xpTotal) userData.xpTotal = 0;
        
        document.getElementById('aluno-nome').innerText = userData.nome;
        atualizarNivelXP();
        
        // Busca sessões da subcoleção de forma segura
        const q = query(collection(db, "users", uid, "studySessions"), orderBy("timestamp", "desc"));
        const sessionSnaps = await getDocs(q);
        studySessions = [];
        sessionSnaps.forEach(d => studySessions.push(d.data()));
        
        atualizarEstatisticas();
    }
}

function atualizarNivelXP() {
    const level = Math.floor(userData.xpTotal / 1000) + 1;
    document.getElementById('aluno-nivel').innerText = `Lvl ${level} • XP: ${userData.xpTotal}`;
}

// Busca os dados reais que o professor salvou
async function carregarTrilhaDoFirestore() {
    const container = document.getElementById('semanas-container');
    container.innerHTML = '<p class="text-sub">Carregando módulos...</p>';

    try {
        const cursoRef = doc(db, "cursos", "curso_padrao");
        const docSnap = await getDoc(cursoRef);
        
        if (docSnap.exists() && docSnap.data().semanas) {
            renderizarSemanas(docSnap.data().semanas);
        } else {
            container.innerHTML = '<p class="text-sub">Nenhum módulo disponível no momento.</p>';
        }
    } catch (e) {
        console.error("Erro ao carregar trilha:", e);
        showToast("Erro ao carregar as aulas.", "error");
    }
}

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
        if (sem.liberada && sem.materiais && sem.materiais.length > 0) {
            sem.materiais.forEach(mat => {
                const icon = mat.tipo === 'pdf' ? 'ri-file-pdf-line' : 'ri-play-circle-line';
                materiaisHTML += `
                    <a href="${mat.link}" target="_blank" class="notion-item" style="border: 1px solid var(--border-color); margin-bottom: 8px;">
                        <i class="${icon}"></i> ${mat.nome}
                    </a>`;
            });
        } else if (sem.liberada) {
            materiaisHTML = '<p class="text-sub text-sm">Nenhum material anexado.</p>';
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
                <h4 style="margin-bottom:4px; font-size:0.95rem;">${sem.titulo || 'Sem Título'}</h4>
                <p class="text-sub text-sm" style="margin-bottom: 12px;">${sem.texto || ''}</p>
                ${materiaisHTML}
            </div>
        `;
        container.appendChild(card);
    });
}

// Lógica de Estudo e Streak
function calcularStreakReal() {
    if (studySessions.length === 0) return 0;
    
    // Agrupa por dia (meia-noite local)
    const diasEstudados = [...new Set(studySessions.map(s => {
        const d = new Date(s.timestamp);
        return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    }))].sort((a, b) => b - a); // Do mais recente pro mais antigo

    let streak = 0;
    let dataReferencia = new Date();
    dataReferencia.setHours(0,0,0,0);
    
    // Verifica se estudou hoje ou ontem para manter o streak ativo
    if (diasEstudados[0] !== dataReferencia.getTime() && 
        diasEstudados[0] !== dataReferencia.getTime() - 86400000) {
        return 0; // Perdeu a ofensiva
    }

    let tempoVerificacao = diasEstudados[0];
    
    for (let i = 0; i < diasEstudados.length; i++) {
        if (diasEstudados[i] === tempoVerificacao) {
            streak++;
            tempoVerificacao -= 86400000; // Subtrai 1 dia
        } else {
            break; // Quebrou a sequência
        }
    }
    return streak;
}

function atualizarEstatisticas() {
    let totalMinutes = 0;
    const subjectData = {};

    studySessions.forEach(session => {
        if (!subjectData[session.subject]) subjectData[session.subject] = 0;
        subjectData[session.subject] += session.duration;
        totalMinutes += session.duration;
    });

    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    document.getElementById('total-study-time').innerText = `${hours}h ${mins}m`;
    
    const streak = calcularStreakReal();
    document.getElementById('streak-count').innerText = streak;

    const canvas = document.getElementById('studyChart');
    if (!canvas) return;
    if (studyChartInstance) studyChartInstance.destroy();
    
    Chart.defaults.color = '#787774';
    Chart.defaults.font.family = "'Inter', sans-serif";

    studyChartInstance = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: Object.keys(subjectData).length > 0 ? Object.keys(subjectData) : ['Nenhum dado'],
            datasets: [{
                label: 'Minutos',
                data: Object.keys(subjectData).length > 0 ? Object.values(subjectData) : [0],
                backgroundColor: '#8B6508',
                borderRadius: 4,
                barPercentage: 0.6
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, grid: { color: '#e9e9e7' } }, x: { grid: { display: false } } }
        }
    });
}

// Timer
let timerInterval = null, timerSeconds = 0, isTimerRunning = false, currentTimerMode = 'stopwatch', countdownTotalSeconds = 0;

function iniciarSalaDeEstudos() {
    const btnPlay = document.getElementById('btn-timer-play');
    const btnPause = document.getElementById('btn-timer-pause');
    const btnStop = document.getElementById('btn-timer-stop');
    const display = document.getElementById('timer-display');
    const subjectSelect = document.getElementById('timer-subject-select');
    const formatTime = (ts) => `${String(Math.floor(ts/3600)).padStart(2,'0')}:${String(Math.floor((ts%3600)/60)).padStart(2,'0')}:${String(ts%60).padStart(2,'0')}`;

    function resetTimerUI() {
        timerSeconds = 0; countdownTotalSeconds = 0; display.innerText = "00:00:00";
        btnPlay.style.display = 'block'; btnPause.style.display = 'none'; btnStop.style.display = 'none';
    }

    async function finishSession(minutesStudied, subjectName) {
        if (minutesStudied >= 1) {
            const novaSessao = { subject: subjectName, duration: minutesStudied, timestamp: Date.now() };
            const xpGained = minutesStudied;

            try {
                // 1. Salva na Subcoleção (Escalável)
                await addDoc(collection(db, "users", currentUser.uid, "studySessions"), novaSessao);
                
                // 2. Atualiza apenas o XP no Perfil Principal
                userData.xpTotal += xpGained;
                await updateDoc(doc(db, "users", currentUser.uid), { xpTotal: userData.xpTotal });
                
                // 3. Atualiza Memória e UI
                studySessions.unshift(novaSessao);
                atualizarNivelXP();
                atualizarEstatisticas();
                showToast(`Sessão salva! +${xpGained} XP 🔥`);
            } catch(e) { console.error(e); showToast("Erro ao salvar progresso.", "error"); }
        } else {
            showToast('Tempo inferior a 1 minuto não gera XP.', 'error');
        }
        resetTimerUI();
    }

    btnPlay.addEventListener('click', () => {
        isTimerRunning = true;
        btnPlay.style.display = 'none'; btnPause.style.display = 'block'; btnStop.style.display = 'block';
        timerInterval = setInterval(() => {
            timerSeconds++; display.innerText = formatTime(timerSeconds);
        }, 1000);
    });

    btnPause.addEventListener('click', () => {
        isTimerRunning = false; clearInterval(timerInterval);
        btnPlay.style.display = 'block'; btnPause.style.display = 'none';
    });

    btnStop.addEventListener('click', () => {
        isTimerRunning = false; clearInterval(timerInterval);
        finishSession(Math.floor(timerSeconds / 60), subjectSelect.value);
    });
}
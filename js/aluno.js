// ARQUIVO: js/aluno.js
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc, updateDoc, collection, addDoc, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let currentUser = null;
let userData = { xpTotal: 0 };
let studySessions = [];
let studyChartInstance = null;

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
    try {
        const docRef = doc(db, "users", uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            userData = docSnap.data();
            if(!userData.xpTotal) userData.xpTotal = 0;
            
            document.getElementById('aluno-nome').innerText = userData.nome;
            document.getElementById('aluno-nivel').innerText = `Lvl ${Math.floor(userData.xpTotal / 1000) + 1} • XP: ${userData.xpTotal}`;
            
            const q = query(collection(db, "users", uid, "studySessions"), orderBy("timestamp", "desc"));
            const sessionSnaps = await getDocs(q);
            studySessions = [];
            sessionSnaps.forEach(d => studySessions.push(d.data()));
            atualizarEstatisticas();
        }
    } catch (e) {
        document.getElementById('aluno-nome').innerText = "Erro ao carregar perfil";
        console.error(e);
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
        container.innerHTML = '<p class="text-red">Erro de permissão no banco. Fale com o professor.</p>';
    }
}

function renderizarSemanas(bancoSemanas) {
    const container = document.getElementById('semanas-container');
    container.innerHTML = '';

    bancoSemanas.forEach(sem => {
        const card = document.createElement('div');
        card.className = `semana-card ${sem.liberada ? 'unlocked' : 'locked'}`;
        const statusBadge = sem.liberada ? '<span class="badge badge-unlocked">Liberado</span>' : '<span class="badge badge-locked"><i class="ri-lock-line"></i> Bloqueado</span>';
        
        let materiaisHTML = '';
        if (sem.liberada && sem.materiais) {
            sem.materiais.forEach(mat => {
                const icon = mat.tipo === 'pdf' ? 'ri-file-pdf-line' : 'ri-play-circle-line';
                materiaisHTML += `<a href="${mat.link}" target="_blank" class="notion-item"><i class="${icon}"></i> ${mat.nome}</a>`;
            });
        }

        card.innerHTML = `
            <div class="semana-header" onclick="if(${sem.liberada}) this.parentElement.classList.toggle('open')">
                <div class="flex-between" style="width: 100%;">
                    <span class="font-medium"><i class="ri-arrow-right-s-line toggle-icon"></i> Semana ${sem.numero.toString().padStart(2, '0')}</span>
                    ${statusBadge}
                </div>
            </div>
            <div class="semana-body">
                <h4 style="margin-bottom:4px;">${sem.titulo || 'Sem Título'}</h4>
                <p class="text-sub text-sm">${sem.texto || ''}</p>
                ${materiaisHTML}
            </div>`;
        container.appendChild(card);
    });
}

function atualizarEstatisticas() {
    let totalMinutes = 0;
    const subjectData = {};
    studySessions.forEach(session => {
        if (!subjectData[session.subject]) subjectData[session.subject] = 0;
        subjectData[session.subject] += session.duration;
        totalMinutes += session.duration;
    });

    document.getElementById('total-study-time').innerText = `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
    
    // Gráfico Chart.js
    const canvas = document.getElementById('studyChart');
    if (!canvas) return;
    if (studyChartInstance) studyChartInstance.destroy();
    
    studyChartInstance = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: Object.keys(subjectData).length > 0 ? Object.keys(subjectData) : ['Nenhum dado'],
            datasets: [{ label: 'Minutos', data: Object.keys(subjectData).length > 0 ? Object.values(subjectData) : [0], backgroundColor: '#8B6508', borderRadius: 4 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
}

let timerInterval = null, timerSeconds = 0, currentTimerMode = 'stopwatch', countdownTotalSeconds = 0;

function iniciarSalaDeEstudos() {
    const btnPlay = document.getElementById('btn-timer-play');
    const btnPause = document.getElementById('btn-timer-pause');
    const btnStop = document.getElementById('btn-timer-stop');
    const display = document.getElementById('timer-display');

    async function finishSession(minutesStudied, subjectName) {
        if (minutesStudied >= 1) {
            const novaSessao = { subject: subjectName, duration: minutesStudied, timestamp: Date.now() };
            try {
                await addDoc(collection(db, "users", currentUser.uid, "studySessions"), novaSessao);
                userData.xpTotal += minutesStudied;
                await updateDoc(doc(db, "users", currentUser.uid), { xpTotal: userData.xpTotal });
                studySessions.unshift(novaSessao);
                atualizarEstatisticas();
                document.getElementById('aluno-nivel').innerText = `Lvl ${Math.floor(userData.xpTotal / 1000) + 1} • XP: ${userData.xpTotal}`;
                alert(`Sessão salva! +${minutesStudied} XP 🔥`);
            } catch(e) { alert("Erro ao salvar progresso."); }
        }
        timerSeconds = 0; display.innerText = "00:00:00";
        btnPlay.style.display = 'block'; btnPause.style.display = 'none'; btnStop.style.display = 'none';
    }

    btnPlay.addEventListener('click', () => {
        btnPlay.style.display = 'none'; btnPause.style.display = 'block'; btnStop.style.display = 'block';
        timerInterval = setInterval(() => {
            timerSeconds++; 
            display.innerText = `${String(Math.floor(timerSeconds/3600)).padStart(2,'0')}:${String(Math.floor((timerSeconds%3600)/60)).padStart(2,'0')}:${String(timerSeconds%60).padStart(2,'0')}`;
        }, 1000);
    });

    btnPause.addEventListener('click', () => {
        clearInterval(timerInterval);
        btnPlay.style.display = 'block'; btnPause.style.display = 'none';
    });

    btnStop.addEventListener('click', () => {
        clearInterval(timerInterval);
        finishSession(Math.floor(timerSeconds / 60), "Geral");
    });
}
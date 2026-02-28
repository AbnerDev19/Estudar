// ARQUIVO: js/professor.js
import { auth, db, storage } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, getDocs, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

let semanasGerais = [];
const syncStatus = document.getElementById('sync-status');

document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            document.getElementById('prof-nome').innerText = user.displayName || "Professor";
            await carregarSemanas();
            await carregarAlunos();
        } else {
            window.location.href = "index.html";
        }
    });

    document.getElementById('btn-logout').addEventListener('click', () => {
        signOut(auth).then(() => window.location.href = "index.html");
    });

    document.getElementById('btn-salvar-tudo').addEventListener('click', salvarSemanas);
});

// --- ROTEAMENTO (Abas) ---
window.switchView = function(viewName) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
    document.getElementById(`view-${viewName}`).classList.add('active');
    document.getElementById(`nav-${viewName}`).classList.add('active');
};

// --- 1. CARREGAR AULAS (SEMANAS) ---
async function carregarSemanas() {
    const cursoRef = doc(db, "cursos", "curso_padrao");
    const docSnap = await getDoc(cursoRef);

    if (docSnap.exists() && docSnap.data().semanas) {
        semanasGerais = docSnap.data().semanas;
    } else {
        semanasGerais = [];
        for (let i = 0; i <= 12; i++) {
            semanasGerais.push({
                numero: i,
                titulo: i === 0 ? "Semana 00: Boas Vindas" : `Semana ${i.toString().padStart(2, '0')}: Título da Aula`,
                texto: "",
                liberada: false,
                materiais: []
            });
        }
    }
    renderizarEditorSemanas();
}

function renderizarEditorSemanas() {
    const container = document.getElementById('editor-semanas-container');
    container.innerHTML = '';

    semanasGerais.forEach((sem, idx) => {
        const block = document.createElement('div');
        block.className = 'semana-block';
        
        // Estilo do badge de status (Usando as cores do MyLife)
        const badgeClass = sem.liberada ? 'badge-easy' : 'badge-hard';
        const badgeText = sem.liberada ? 'Conteúdo Liberado' : 'Acesso Bloqueado';
        const lockIcon = sem.liberada ? 'ri-unlock-line text-green' : 'ri-lock-line text-red';

        // Arquivos renderizados como itens do Notion
        let anexosHTML = '';
        if(sem.materiais) {
            sem.materiais.forEach((mat, matIdx) => {
                const icon = mat.tipo === 'pdf' ? 'ri-file-pdf-line' : 'ri-attachment-line';
                anexosHTML += `
                    <div class="notion-item" style="border: 1px solid var(--border-color); margin-bottom: 8px;">
                        <i class="${icon} text-yellow" style="font-size:1.2rem; margin-right:12px;"></i>
                        <div class="item-info">
                            <span class="item-name">${mat.nome}</span>
                        </div>
                        <div class="item-actions">
                            <button class="icon-btn delete" onclick="removerMaterial(${idx}, ${matIdx})" title="Excluir"><i class="ri-delete-bin-line"></i></button>
                        </div>
                    </div>
                `;
            });
        }

        block.innerHTML = `
            <div class="semana-header" onclick="this.parentElement.classList.toggle('open')">
                <h3><i class="ri-arrow-right-s-line toggle-icon"></i> Semana ${sem.numero.toString().padStart(2, '0')}</h3>
                <span class="badge ${badgeClass}"><i class="${lockIcon}" style="margin-right:4px;"></i> ${badgeText}</span>
            </div>
            
            <div class="semana-content">
                <div class="flex-between mb-3" style="background: var(--bg-hover); padding: 12px; border-radius: var(--radius-sm);">
                    <span class="text-sm font-medium text-sub">Status de visualização para o aluno:</span>
                    <button class="action-btn" onclick="toggleStatus(${idx})" style="background: ${sem.liberada ? 'var(--bg-main)' : 'var(--blue)'}; color: ${sem.liberada ? 'var(--text-main)' : 'white'};">
                        ${sem.liberada ? 'Bloquear Alunos' : 'Liberar para Alunos'}
                    </button>
                </div>

                <div class="input-group">
                    <label class="text-sm text-sub font-medium mb-1" style="display:block;">Título da Módulo</label>
                    <input type="text" class="notion-input" value="${sem.titulo}" onchange="atualizarTexto(${idx}, 'titulo', this.value)">
                </div>

                <div class="input-group">
                    <label class="text-sm text-sub font-medium mb-1" style="display:block;">Instruções / Texto Base</label>
                    <textarea class="notion-input" rows="3" placeholder="Escreva o texto de apoio aqui..." onchange="atualizarTexto(${idx}, 'texto', this.value)">${sem.texto}</textarea>
                </div>

                <div style="margin-top: 24px;">
                    <label class="text-sm text-sub font-medium" style="display:block; margin-bottom:8px;">Materiais de Estudo (PDFs)</label>
                    ${anexosHTML}
                    
                    <label class="upload-zone" for="upload-${idx}">
                        <div class="upload-label">
                            <i class="ri-upload-cloud-2-line" id="upload-icon-${idx}"></i>
                            <span class="text-sub text-sm font-medium" id="upload-status-${idx}">Clique para anexar um PDF</span>
                        </div>
                        <input type="file" id="upload-${idx}" accept=".pdf,.doc,.docx" onchange="fazerUpload(${idx}, this)">
                    </label>
                </div>
            </div>
        `;
        container.appendChild(block);
    });
}

// Interações em Memória
window.toggleStatus = function(idx) {
    semanasGerais[idx].liberada = !semanasGerais[idx].liberada;
    renderizarEditorSemanas();
}
window.atualizarTexto = function(idx, campo, valor) {
    semanasGerais[idx][campo] = valor;
}
window.removerMaterial = function(idxSemana, idxMaterial) {
    if(confirm("Remover este arquivo definitivamente?")) {
        semanasGerais[idxSemana].materiais.splice(idxMaterial, 1);
        renderizarEditorSemanas();
    }
}

// --- 2. UPLOAD PARA O STORAGE ---
window.fazerUpload = async function(idx, inputElement) {
    const file = inputElement.files[0];
    if (!file) return;

    const statusText = document.getElementById(`upload-status-${idx}`);
    const icon = document.getElementById(`upload-icon-${idx}`);
    
    statusText.innerText = `Enviando ${file.name}...`;
    statusText.classList.replace('text-sub', 'text-blue');
    icon.className = "ri-loader-4-line spin text-blue";

    try {
        const storageRef = ref(storage, `materiais/sem_${idx}_${Date.now()}_${file.name}`);
        const snapshot = await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(snapshot.ref);

        semanasGerais[idx].materiais.push({
            tipo: file.type.includes('pdf') ? 'pdf' : 'outro',
            nome: file.name,
            link: downloadURL
        });

        renderizarEditorSemanas();
    } catch (e) {
        console.error("Erro no upload:", e);
        statusText.innerText = "Erro ao enviar arquivo.";
        statusText.classList.replace('text-blue', 'text-red');
        icon.className = "ri-error-warning-line text-red";
    }
}

// --- 3. SALVAR TUDO ---
async function salvarSemanas() {
    const btn = document.getElementById('btn-salvar-tudo');
    btn.innerHTML = '<i class="ri-loader-4-line spin"></i> Salvando...';
    btn.disabled = true;
    syncStatus.classList.add('active');

    try {
        await setDoc(doc(db, "cursos", "curso_padrao"), { semanas: semanasGerais });
        
        btn.innerHTML = '<i class="ri-check-double-line"></i> Tudo Salvo!';
        btn.style.background = "var(--green)";
        syncStatus.classList.replace('active', 'success');
        syncStatus.innerText = "Salvo com sucesso!";

        setTimeout(() => {
            btn.innerHTML = '<i class="ri-save-line"></i> Salvar Alterações';
            btn.style.background = "var(--blue)";
            btn.disabled = false;
            syncStatus.classList.remove('success');
        }, 2500);
    } catch (e) {
        console.error(e);
        alert("Erro ao salvar.");
        btn.disabled = false;
        syncStatus.classList.remove('active');
    }
}

// --- 4. LISTA DE ALUNOS (Com a classe linda .notion-item do MyLife) ---
async function carregarAlunos() {
    const container = document.getElementById('lista-alunos-container');
    try {
        const querySnapshot = await getDocs(collection(db, "users"));
        container.innerHTML = '';
        let temAluno = false;

        querySnapshot.forEach(doc => {
            const data = doc.data();
            if (data.role === 'aluno') {
                temAluno = true;
                const xp = data.xpTotal || 0;
                const level = Math.floor(xp / 1000) + 1;
                
                container.innerHTML += `
                    <div class="notion-item" style="border: 1px solid var(--border-color); padding: 12px; margin-bottom: 8px;">
                        <div class="custom-check" style="background: var(--blue); border-color: var(--blue); color: white;">
                            <i class="ri-user-smile-line" style="font-size: 14px;"></i>
                        </div>
                        <div class="item-info">
                            <span class="item-name font-medium">${data.nome || 'Aluno Sem Nome'}</span>
                            <span class="item-meta">${data.email}</span>
                            <span class="item-attr-badge">Lvl ${level}</span>
                            <span class="item-attr-badge text-yellow" style="font-weight:600;"><i class="ri-fire-fill"></i> ${xp} XP</span>
                        </div>
                    </div>
                `;
            }
        });

        if (!temAluno) container.innerHTML = '<p class="text-sub text-sm">Nenhum aluno matriculado ainda.</p>';
    } catch (e) {
        console.error("Erro ao carregar alunos", e);
    }
}
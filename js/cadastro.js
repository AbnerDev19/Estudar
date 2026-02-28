// ARQUIVO: js/cadastro.js
import { auth, db } from './firebase-config.js';
import { createUserWithEmailAndPassword, updateProfile } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// --- Lista de Acesso Restrito (Professores) ---
// Qualquer e-mail que NÃO estiver aqui será cadastrado como "aluno"
const ADMIN_EMAILS = [
    "abneroliveira19072004@gmail.com",
    "professor@exemplo.com"
];

const registerForm = document.getElementById('register-form');
const errorMsg = document.getElementById('auth-error');
const btnRegister = document.getElementById('btn-register');

// --- Função de Redirecionamento ---
function redirecionar(user) {
    if (ADMIN_EMAILS.includes(user.email)) {
        window.location.href = "professor_dashboard.html";
    } else {
        window.location.href = "aluno_dashboard.html";
    }
}

// --- Lógica de Submissão ---
registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const nome = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirmPassword = document.getElementById('reg-confirm-password').value;

    // 1. Validação simples de senha
    if (password !== confirmPassword) {
        errorMsg.innerText = "As senhas não coincidem.";
        errorMsg.classList.add('active');
        return;
    }

    // Feedback visual de carregamento
    btnRegister.innerText = "Criando conta...";
    btnRegister.disabled = true;
    errorMsg.classList.remove('active');

    try {
        // 2. Cria usuário no Firebase Auth
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // 3. Atualiza o Perfil com o Nome
        await updateProfile(user, { displayName: nome });

        // 4. Cria o registro base no Firestore
        await setDoc(doc(db, "users", user.uid), {
            nome: nome,
            email: email,
            role: ADMIN_EMAILS.includes(email) ? "professor" : "aluno",
            dataCadastro: new Date().toISOString(),
            xpTotal: 0 // Base para a gamificação estilo MyLife
        });

        // 5. Redireciona para o painel correto
        redirecionar(user);

    } catch (error) {
        console.error("Erro no cadastro:", error);
        btnRegister.innerText = "Criar Conta";
        btnRegister.disabled = false;
        
        // Tratamento de erros comuns do Firebase
        if (error.code === 'auth/email-already-in-use') {
            errorMsg.innerText = "Este e-mail já está cadastrado.";
        } else if (error.code === 'auth/weak-password') {
            errorMsg.innerText = "A senha é muito fraca (mínimo de 6 caracteres).";
        } else {
            errorMsg.innerText = "Erro ao criar conta. Tente novamente mais tarde.";
        }
        
        errorMsg.classList.add('active');
    }
});
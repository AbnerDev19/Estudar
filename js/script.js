// ARQUIVO: js/auth.js
import { auth, db } from './firebase-config.js';
import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    updateProfile 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// --- Lista de Acesso Restrito (Professores) ---
const ADMIN_EMAILS = [
    "abneroliveira19072004@gmail.com",
    "professor@exemplo.com"
];

// --- Elementos da DOM ---
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const btnToggleAuth = document.getElementById('btn-toggle-auth');
const authTitle = document.getElementById('auth-title');
const authSubtitle = document.getElementById('auth-subtitle');
const toggleText = document.getElementById('toggle-text');
const errorMsg = document.getElementById('auth-error');

let isLoginMode = true;

// --- Alternar entre Login e Cadastro ---
btnToggleAuth.addEventListener('click', () => {
    errorMsg.classList.remove('active');
    isLoginMode = !isLoginMode;
    
    if (isLoginMode) {
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
        authTitle.innerText = "Entrar";
        authSubtitle.innerText = "Bem-vindo de volta à sua área de estudos.";
        toggleText.innerHTML = 'Não tem uma conta? <button type="button" id="btn-toggle-auth" class="btn-link">Cadastre-se</button>';
    } else {
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
        authTitle.innerText = "Criar Conta";
        authSubtitle.innerText = "Inicie sua jornada de aprendizado.";
        toggleText.innerHTML = 'Já tem uma conta? <button type="button" id="btn-toggle-auth" class="btn-link">Entrar</button>';
    }
    
    // Reatribuir evento ao novo botão recriado
    document.getElementById('btn-toggle-auth').addEventListener('click', () => btnToggleAuth.click());
});

// --- Função de Redirecionamento ---
function redirecionar(user) {
    if (ADMIN_EMAILS.includes(user.email)) {
        window.location.href = "professor_dashboard.html";
    } else {
        window.location.href = "aluno_dashboard.html";
    }
}

// --- Lógica de Login ---
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const btn = document.getElementById('btn-login');

    btn.innerText = "Aguarde...";
    btn.disabled = true;
    errorMsg.classList.remove('active');

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        redirecionar(userCredential.user);
    } catch (error) {
        errorMsg.innerText = "Falha no login. Verifique seu e-mail e senha.";
        errorMsg.classList.add('active');
        btn.innerText = "Entrar";
        btn.disabled = false;
    }
});

// --- Lógica de Cadastro ---
registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    const btn = document.getElementById('btn-register');

    btn.innerText = "Criando...";
    btn.disabled = true;
    errorMsg.classList.remove('active');

    try {
        // Cria usuário no Firebase Auth
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Atualiza o Perfil com o Nome
        await updateProfile(user, { displayName: nome });

        // Cria o registro base no Firestore
        await setDoc(doc(db, "users", user.uid), {
            nome: nome,
            email: email,
            role: ADMIN_EMAILS.includes(email) ? "professor" : "aluno",
            dataCadastro: new Date().toISOString(),
            xpTotal: 0 // Base para gamificação futura
        });

        redirecionar(user);

    } catch (error) {
        errorMsg.innerText = "Erro ao criar conta. Talvez o e-mail já esteja em uso.";
        errorMsg.classList.add('active');
        btn.innerText = "Criar Conta";
        btn.disabled = false;
    }
});
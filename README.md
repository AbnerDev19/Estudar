# Plataforma de Estudos

## Configuração do Backend (Python/Flask)
O backend é responsável pelo envio (upload) de materiais das aulas, salvando-os no servidor local.

### Pré-requisitos
- Python 3 instalado.

### Instalação e Execução
1. Navegue até a pasta do backend e instale as dependências:
   ```bash
   cd backend
   pip install -r requirements.txt
   ```
2. Execute a aplicação Flask:
   ```bash
   python3 app.py
   ```
   O backend estará rodando em `http://127.0.0.1:5000`.

## Configuração do Frontend
Basta abrir o arquivo `index.html` em seu navegador para acessar a aplicação.
Para acessar os painéis de professor e aluno, é necessário se autenticar na aplicação.

O arquivo `js/professor.js` já está configurado para se comunicar com o backend local no endpoint de upload (`http://127.0.0.1:5000/upload`).

## Arquitetura
O sistema utiliza Firebase para autenticação e armazenamento de dados no Firestore, enquanto o upload de arquivos de materiais das aulas utiliza o backend Python local, que salva os dados no diretório `backend/uploads`.

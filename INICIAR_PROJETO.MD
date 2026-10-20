// PASSO 1: Acesse o diretorio "database", copie todo o conteudo do arquivo "instalacao-mysql.sql" e execute no banco

// PASSO 2: Revise o .env, pq se la tiver errado a configuracao do banco, ele nao vai conectar. Se precisar de uma SESSION_SECRET pode usar a que esta aqui em baixo:
6ea43a12bbf97737e96b34645220c4fb6bc2ed2302e212dcbbbe7d612ecbdf6a

//PASSO 3:
execute o comando abaixo para as instalações:
npm init -y
npm install mysql2 nodemon express

//PASSO 4: no cmd, execute o comando para criar seu usuario admin:
npm run admin:criar

OBSERVACAO: A senha tem validação, tem que ter letra maiuscula, minuscula, caracter especial.... Vou deixar um modelo de senha valido abaixo:
TauSports2026!

// PASSO 5: npm start
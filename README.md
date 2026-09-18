# Controle de Polimentos

Sistema local para registrar, consultar e exportar os polimentos da equipe de lavagem. Os dados oficiais ficam exclusivamente no arquivo SQLite `database.db`.

## Instalação e uso

1. Instale o [Node.js LTS](https://nodejs.org/) (versão 18 ou superior).
2. Abra a pasta deste projeto em um terminal.
3. Execute `npm install`.
4. Execute `npm start`.
5. Acesse `http://localhost:3000` no navegador.

Usuário inicial: `lider`  
Senha inicial: `Polimento@2026`

Usuário operacional: `polidor`  
Senha inicial: `Polidor@2026`  
O perfil **Polidor** não visualiza nem acessa a área de Administração, backup ou restauração.

### Se a instalação falhar no Windows

O projeto suporta Node.js 20, 22 e 24. Caso uma tentativa anterior tenha sido interrompida e exiba erros `EBUSY` ou `EPERM`, feche terminais, o servidor e qualquer editor que esteja usando esta pasta; depois, no PowerShell, execute `Remove-Item -Recurse -Force node_modules` e `Remove-Item package-lock.json -Force` (se existir). Em seguida, rode novamente `npm install`. A versão atual do `better-sqlite3` inclui binários pré-compilados para plataformas principais, dispensando Python na instalação comum.

Altere a senha inicial antes de uma implantação real: gere um hash bcrypt e atualize o campo `senha_hash` na tabela `usuarios`. A estrutura de usuários já possui os papéis `lider`, `supervisor` e pode receber `administrador` futuramente.

## Banco e backup

O banco está em `database.db`, na raiz do projeto. No menu **Administração**, use **Baixar backup** para guardar uma cópia. Para restaurar, selecione um arquivo `.db`, confirme a ação e reinicie o servidor após a confirmação. A restauração substitui a base atual.

## Veículos, modelos e cores

As listas ficam organizadas no objeto `VEHICLES` em `public/js/app.js`. Adicione veículos, modelos e cores ali; a interface se atualiza automaticamente. As opções **OUTRO** permitem registros não cadastrados sem alterar o código.

## Implantação futura

Use um servidor Node.js com armazenamento persistente para a pasta do projeto, principalmente para `database.db`. Defina uma variável de ambiente forte em `SESSION_SECRET`, mantenha backups regulares e use HTTPS/reverse proxy em ambiente acessível pela rede.

## Recursos incluídos

- Login com senha bcrypt e sessão no backend
- Cadastro, edição, visualização e exclusão com SQLite e queries parametrizadas
- Dashboard, pesquisa por chassi, filtros e relatório mensal
- Exportação PDF e Excel, texto para WhatsApp e backup/restauração

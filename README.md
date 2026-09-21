# Rova Tech — jardim 3D com gato branco

Código-fonte completo do jogo, agora com árvores ramificadas, folhas recortadas, casca detalhada e grama em 3D. O gato e os objetos mantêm uma direção artística estilizada; esta versão não é fotorrealista.

## Rodar no computador

Requisito: Node.js 22.13 ou superior. Extraia o ZIP e abra um terminal dentro da pasta `rova-tech`.

```bash
npx pnpm@11.25.0 install
npx pnpm@11.25.0 dev
```

Abra http://localhost:5173 no navegador. A primeira instalação precisa de internet para baixar as dependências. O jogo não exige chave de API.

## Controles

WASD ou setas: andar na direção da câmera. Clique curto no chão: caminhar até o ponto. Arraste com o botão esquerdo ou direito: girar a câmera horizontalmente e ajustar sua inclinação. Roda do mouse ou rolagem do trackpad: aproximar e afastar. R ou botão Restaurar câmera: recuperar a visão inicial. O zoom tem limites e a câmera permanece acima do chão. Espaço: pular. Shift: correr. E: miar. Esc/P: pausar. No celular há controles na tela. Encontre 12 peixes para concluir a partida. O progresso fica na memória da partida e reinicia ao recarregar.

## Onde editar

- `app/scene-performance.ts`: agrupamento de objetos fixos e resolução adaptável.
- `app/camera-controls.ts`: zoom, rotação, limites e distinção entre clique e arraste.
- `app/world.ts`: gato, cenário, câmera, animação, colisões, movimentação e coleta.
- `app/cat-coat.ts`: volume arredondado e pelos agrupados do pescoço e do rabo.
- `app/vegetation.ts`: árvores e arbustos procedurais, folhas, grama curva e sombras de copa.
- `app/appearance.ts`: texturas procedurais, orelhas curvas, detalhes de pelo e sombras.
- `app/software-renderer.ts`: renderizador 3D alternativo com buffer de profundidade, luz interpolada e texturas para navegadores sem WebGL2.
- `app/page.tsx`: interface, menus, pontuação e controles.
- `app/globals.css`: aparência e adaptação a celular.
- `public/gato-fur-texture.webp`: textura de pelo criada para este jogo.
- `public/gato-avatar.webp`: retrato do gato.

## Compilar

```bash
npx pnpm@11.25.0 build
```

Stack: React, TypeScript, Three.js e Vinext. O projeto mantém os componentes e as configurações do ambiente em que foi criado. Os arquivos do jogo podem ser reutilizados em outro projeto React. A pasta `.openai` identifica apenas a hospedagem deste projeto e não é necessária para jogar localmente.

## Melhorias visuais desta versão

O gato tem cabeça e bochechas arredondadas, barriga e patinhas mais cheias, orelhas menores e pupilas redondas. O pescoço ganhou uma gola de pelos e o rabo tem volume de pluma com ponta curva. Os pelos dessas duas regiões ficam em apenas duas malhas, sem simulação individual por fio nem novas imagens para baixar.

As antigas copas esféricas foram removidas. As árvores usam galhos recursivos e folhas com recorte de transparência, copas assimétricas, texturas de casca e movimento suave. Os arbustos também têm ramos e folhas. A grama usa lâminas curvas reunidas em uma malha, com caminhos livres. Há sombras suaves e irregulares sob as árvores.

O renderizador principal usa WebGL2, luz de ambiente, materiais e sombras. O modo alternativo para dispositivos sem WebGL2 usa as mesmas árvores, texturas, recorte de folhas, cores por vértice e profundidade 3D. Ele oferece iluminação mais simples e pode ter menor desempenho em computadores lentos.

## Validação

Verificação TypeScript e compilação de produção. Revisão visual da tela inicial e da partida com as novas árvores no navegador, usando o modo sem WebGL2 disponível no ambiente de teste. Caminhada por clique, coleta e pausa verificadas nesta revisão. O visual específico de WebGL2 não foi validado neste navegador. WebMCP é opcional.

## Recursos e dependências

Os dois arquivos de imagem foram gerados para o projeto. A vegetação utiliza [EZ-Tree](https://github.com/dgreenheck/ez-tree), de Daniel Greenheck, sob licença MIT; consulte `THIRD_PARTY_NOTICES.md`. As dependências de terceiros mantêm suas respectivas licenças. O pacote não inclui node_modules, credenciais, configurações pessoais nem histórico Git.

## Câmera e desempenho

O mouse permite zoom e rotação com transição suave. Um clique curto move o gato; arrastar muda somente a câmera. O teclado acompanha a orientação da câmera.

Objetos repetidos do jardim são agrupados por geometria e material no WebGL. Sombras fixas são calculadas uma vez, com atualização quando as texturas terminam de carregar. A densidade de pixels se adapta automaticamente à carga da GPU, mantendo modelos, texturas e antialiasing. As duas imagens do gato usam WebP sem perdas, com os mesmos pixels dos arquivos originais.

No renderizador sem WebGL, o cenário fixo é reutilizado quando a câmera está parada. Durante o movimento, a resolução interna é reduzida temporariamente, com retorno à resolução maior ao parar; as malhas pequenas usam detalhe proporcional ao tamanho na tela. As copas continuam com galhos e folhas recortadas.

Medições da versão anterior no navegador de teste sem WebGL: a renderização inicial passou de cerca de 222 ms para 27 ms por quadro; com a câmera parada, chegou a cerca de 16 ms. Durante uma caminhada longa, o custo caiu de cerca de 204 ms para 94 ms por quadro. São tempos de renderização desse ambiente, não uma garantia de FPS em outros dispositivos. A aceleração WebGL não está disponível no navegador de teste.

## GitHub Pages

Esta versão também pode ser publicada como um site estático, sem servidor ou chave de API. A página reutiliza o mesmo jogo e seus controles.

```bash
npx pnpm@11.25.0 install --frozen-lockfile
npx pnpm@11.25.0 build:pages
```

O resultado fica em `dist-pages/`. Os endereços de imagens e scripts são relativos e funcionam tanto no domínio principal quanto dentro do caminho de um repositório.

O fluxo `.github/workflows/github-pages.yml` compila e publica quando a branch `main` recebe alterações, ou por execução manual. No repositório de destino, configure **Settings → Pages → Source → GitHub Actions**. O arquivo `vite.github-pages.config.ts` não depende da hospedagem original. Não publique `node_modules`, `.env`, `.git` ou pastas de trabalho.

Configuração baseada na [documentação oficial do GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

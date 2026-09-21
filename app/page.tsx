"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpRight, Fish, PawPrint, Play, Pause, RotateCcw, HelpCircle, Volume2, VolumeX, X, Sparkles, Flag, Moon, Timer, Scan } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import type { GameAPI, GameSnapshot } from "./world";

const initial: GameSnapshot = { mode: "intro", collected: 0, seconds: 0, moving: false };
const clock = (s: number) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
export default function Home() {
  const stage = useRef<HTMLDivElement>(null);
  const game = useRef<GameAPI | null>(null);
  const [snapshot, setSnapshot] = useState(initial);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [help, setHelp] = useState(false);
  const [sound, setSound] = useState(false);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    let cancelled = false;
    import("./world").then(({ createGame }) => {
      if (cancelled || !stage.current) return;
      game.current = createGame(stage.current, setSnapshot, (message) => {
        setToast(message);
        if (toastTimer.current) clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(""), 2500);
      });
      setReady(true);
    }).catch(() => setError("Não foi possível abrir o cenário 3D. Tente atualizar a página ou ativar a aceleração gráfica do navegador."));
    return () => { cancelled = true; game.current?.dispose(); if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, []);
  useEffect(() => {
    if (!ready) return;
    type Tool = { name: string; title: string; description: string; inputSchema: object; annotations: object; execute: (input: unknown) => unknown };
    const context = (document as Document & { modelContext?: { registerTool: (tool: Tool, options: { signal: AbortSignal }) => Promise<void> | void } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    for (const tool of [
      { name: "read_cat_game", title: "Ler partida", description: "Read the white cat game's current state and objective.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true }, execute: () => game.current?.snapshot() },
      { name: "control_cat_game", title: "Controlar partida", description: "Start, pause, resume or restart the white cat game using the same actions as the visible controls.", inputSchema: { type: "object", properties: { action: { type: "string", enum: ["start", "pause", "resume", "restart"] } }, required: ["action"], additionalProperties: false }, annotations: { readOnlyHint: false }, execute: (input: unknown) => { const action = (input as { action?: string })?.action; if (!action || !["start", "pause", "resume", "restart"].includes(action)) throw new Error("Ação inválida."); const api = game.current; if (!api) throw new Error("Jogo carregando."); if (action === "start" || action === "restart") api.start(); else api.pause(action === "pause"); return api.snapshot(); } },
    ]) { try { Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); } catch {} }
    return () => lifecycle.abort();
  }, [ready]);
  const mode = snapshot.mode;
  const playing = mode === "playing";
  const openHelp = () => { if (playing) game.current?.pause(true); setHelp(true); };
  const closeHelp = () => { setHelp(false); if (mode === "paused") game.current?.pause(false); };
  return <main className={`game-shell mode-${mode}`}>
    <div className="world" ref={stage} role="img" aria-label="Jardim 3D da Rova Tech, com um gato branco, árvores, flores, um lago e peixes dourados para coletar." />
    <div className="vignette" />
    <header className="topbar">
      <a className="brand" href="./" aria-label="Rova Tech, início"><span className="brand-mark"><PawPrint size={25} strokeWidth={2.1}/></span><span>Rova <span className="brand-tech">Tech</span><span className="brand-period">.</span></span></a>
      <div className="location"><span className="sun-dot"/>Jardim do Sol<span className="location-divider"/>Aventura 01</div>
      <nav className="top-actions" aria-label="Controles do jogo">
        <button className="icon-button" aria-label="Restaurar câmera" title="Restaurar câmera (R)" onClick={()=>game.current?.resetCamera()} disabled={!ready}><Scan size={20}/></button>
        <button className="icon-button" aria-label={sound ? "Desativar sons" : "Ativar sons"} title={sound ? "Desativar sons" : "Ativar sons"} onClick={() => { game.current?.sound(!sound); setSound(!sound); }}>{sound ? <Volume2 size={20}/> : <VolumeX size={20}/>}</button>
        <button className="icon-button" aria-label="Como jogar" title="Como jogar" onClick={openHelp}><HelpCircle size={20}/></button>
        {(playing || mode === "paused") && <button className="icon-button pause-button" aria-label={playing ? "Pausar" : "Continuar"} onClick={() => game.current?.pause(playing)}>{playing ? <Pause size={20}/> : <Play size={20}/>}</button>}
      </nav>
    </header>
    {mode === "intro" && <section className="intro-panel" aria-labelledby="game-title">
      <div className="chapter"><span>01</span> A AVENTURA COMEÇA AQUI</div>
      <h1 id="game-title">Pequenas patas.<br/><em>Grandes descobertas.</em></h1>
      <p>Um jardim ensolarado, peixinhos escondidos<br className="desktop-break"/> e um gato branco muito curioso.</p>
      <button className="play-button" onClick={() => game.current?.start()} disabled={!ready || !!error}><Play size={19} fill="currentColor"/>{ready ? "Vamos brincar" : "Preparando o jardim…"}<ArrowUpRight size={22}/></button>
      <span className="no-rush"><Sparkles size={15}/> Explore no seu ritmo. Sem pressa.</span>
    </section>}
    {mode !== "intro" && <div className="mission-card">
      <div className="mission-row"><span className="fish-symbol"><Fish size={24}/></span><div><span className="eyebrow">PEIXINHOS ENCONTRADOS</span><strong>{snapshot.collected}<span> / 12</span></strong></div><span className="time"><Timer size={14}/>{clock(snapshot.seconds)}</span></div>
      <Progress className="fish-progress" value={snapshot.collected / 12 * 100} aria-label={`${snapshot.collected} de 12 peixes encontrados`}/>
    </div>}
    {mode === "intro" && <div className="cat-card"><img src="./gato-avatar.webp" alt="Retrato de um gato branco de olhos azuis"/><div><span>SEU COMPANHEIRO</span><strong>Gato branco <PawPrint size={14}/></strong></div><span className="cat-tag">Explorador nato</span></div>}
    {(mode === "intro" || playing) && <div className="objective-label"><span className="objective-icon"><Flag size={18}/></span><div><small>SUA MISSÃO</small><span>Encontre os 12 peixinhos</span></div></div>}
    <footer className="control-bar"><div className="keyboard-group"><span className="keys"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span><span>ou setas para mover</span></div><div><kbd>Espaço</kbd><span>Pular</span></div><div><kbd>Shift</kbd><span>Correr</span></div><div><kbd>E</kbd><span>Miar</span></div><span className="footer-note">Arraste: girar · Roda: zoom · Clique: andar</span></footer>
    {playing && <div className="touch-controls"><div className="dpad">{[{key:"ArrowUp",name:"Mover para cima",Icon:ArrowUp},{key:"ArrowLeft",name:"Mover para a esquerda",Icon:ArrowLeft},{key:"ArrowDown",name:"Mover para baixo",Icon:ArrowDown},{key:"ArrowRight",name:"Mover para a direita",Icon:ArrowRight}].map(({key,name,Icon}) => <button key={key} className={key} aria-label={name} onPointerDown={e=>{ e.currentTarget.setPointerCapture(e.pointerId); game.current?.key(key,true);}} onPointerUp={()=>game.current?.key(key,false)} onPointerCancel={()=>game.current?.key(key,false)} onLostPointerCapture={()=>game.current?.key(key,false)}><Icon size={24}/></button>)}</div><div className="touch-actions"><button aria-label="Miar" onClick={()=>game.current?.meow()}><PawPrint size={22}/></button><button className="jump-touch" onPointerDown={()=>game.current?.jump()} aria-label="Pular"><ArrowUp size={25}/><span>Pular</span></button></div></div>}
    <div className={`toast ${toast ? "visible" : ""}`} role="status" aria-live="polite"><PawPrint size={18}/>{toast}</div>
    {error && <div className="error-card" role="alert"><h2>O jardim precisa de uma ajudinha</h2><p>{error}</p><button className="play-button" onClick={()=>location.reload()}>Tentar novamente</button></div>}
    <Dialog open={help} onOpenChange={(open)=>open ? openHelp() : closeHelp()}><DialogContent className="game-dialog" showCloseButton={false}><button className="dialog-close" onClick={closeHelp} aria-label="Fechar ajuda"><X size={20}/></button><span className="dialog-icon"><PawPrint size={30}/></span><DialogTitle>Um passo de cada vez.</DialogTitle><DialogDescription>Leve seu gato pelo jardim e encoste nos 12 peixes dourados. Clique no chão para caminhar ou use o teclado. Não há limite de tempo.</DialogDescription><div className="help-keys"><div><span>Andar pelo jardim</span><strong>W A S D / ↑ ← ↓ →</strong></div><div><span>Pular obstáculos</span><kbd>Espaço</kbd></div><div><span>Correr</span><kbd>Shift</kbd></div><div><span>Soltar um miau</span><kbd>E</kbd></div><div><span>Girar a câmera</span><strong>Arrastar o mouse</strong></div><div><span>Aproximar / afastar</span><strong>Roda do mouse</strong></div><div><span>Restaurar câmera</span><kbd>R</kbd></div><div><span>Pausar</span><kbd>Esc / P</kbd></div></div><p className="help-note">No celular, use os botões na tela. Todas as ações têm retorno visual, mesmo com o som desligado.</p><button className="play-button" onClick={closeHelp}>Entendi <ArrowRight size={20}/></button></DialogContent></Dialog>
    <Dialog open={mode === "paused" && !help} onOpenChange={open=>!open && game.current?.pause(false)}><DialogContent className="game-dialog pause-dialog" showCloseButton={false}><span className="dialog-icon"><Moon size={30}/></span><DialogTitle>Uma pausa para espreguiçar.</DialogTitle><DialogDescription>Seus peixinhos estão guardados nesta partida.</DialogDescription><button className="play-button" onClick={()=>game.current?.pause(false)}><Play size={18} fill="currentColor"/>Continuar explorando</button><button className="text-button" onClick={()=>game.current?.start()}><RotateCcw size={16}/>Recomeçar aventura</button></DialogContent></Dialog>
    <Dialog open={mode === "won"}><DialogContent className="game-dialog win-dialog" showCloseButton={false}><span className="victory-stars">✦ ✦ ✦</span><DialogTitle>Um dia perfeito no jardim.</DialogTitle><DialogDescription>Você encontrou todos os peixinhos! O jardim ganhou seu melhor explorador.</DialogDescription><div className="win-stats"><span><Fish size={24}/><strong>12 / 12</strong>peixinhos</span><span><Timer size={24}/><strong>{clock(snapshot.seconds)}</strong>de aventura</span></div><button className="play-button" onClick={()=>game.current?.start()}><RotateCcw size={18}/>Brincar de novo</button></DialogContent></Dialog>
  </main>;
}

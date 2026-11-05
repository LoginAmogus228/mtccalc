import { useState, useRef, useEffect, useCallback } from 'react';

interface Point {
  x: number;
  y: number;
}

interface FireSolution {
  azimuth: number;
  elevation: number;
  distance: number;
  flightTime: number;
}

interface ShellType {
  id: string;
  name: string;
  type: 'HE' | 'AP' | 'HEAT' | 'SMOKE';
  damage: number;
  splash: number;
  velocity: number;
  effectiveRange: number;
  description: string;
}

interface AIRecommendation {
  shellType: ShellType;
  confidence: number;
  reason: string;
  terrainAnalysis: string;
  effectiveness: number;
}

interface TargetData {
  position: Point;
  type?: string;
  armor?: number;
  priority?: 'high' | 'medium' | 'low';
}

// Баллистические константы
const GRAVITY = 196.2;
const MAP_SIZE = 1000;
const GRID_SIZE = 100;

// Типы снарядов
const SHELL_TYPES: ShellType[] = [
  {
    id: 'he',
    name: 'ОФ-540',
    type: 'HE',
    damage: 150,
    splash: 25,
    velocity: 300,
    effectiveRange: 600,
    description: 'Осколочно-фугасный. Эффективен против пехоты и лёгкой техники.'
  },
  {
    id: 'ap',
    name: 'Бр-540',
    type: 'AP',
    damage: 200,
    splash: 5,
    velocity: 350,
    effectiveRange: 500,
    description: 'Бронебойный. Пробивает тяжёлую броню.'
  },
  {
    id: 'heat',
    name: 'Кум-540',
    type: 'HEAT',
    damage: 250,
    splash: 10,
    velocity: 280,
    effectiveRange: 450,
    description: 'Кумулятивный. Высокое пробитие на любой дистанции.'
  },
  {
    id: 'smoke',
    name: 'Дым-540',
    type: 'SMOKE',
    damage: 0,
    splash: 40,
    velocity: 250,
    effectiveRange: 550,
    description: 'Дымовой. Создаёт дымовую завесу.'
  }
];

function calculateFireSolution(gunPos: Point, targetPos: Point, shellType: ShellType): FireSolution {
  const dx = targetPos.x - gunPos.x;
  const dy = targetPos.y - gunPos.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  
  let azimuth = Math.atan2(dx, -dy) * (180 / Math.PI);
  if (azimuth < 0) azimuth += 360;
  
  const v2 = shellType.velocity * shellType.velocity;
  const discriminant = v2 * v2 - GRAVITY * (GRAVITY * distance * distance);
  
  let elevation: number;
  if (discriminant < 0 || distance > v2 / GRAVITY) {
    elevation = 45;
  } else {
    elevation = 0.5 * Math.asin(GRAVITY * distance / v2) * (180 / Math.PI);
  }
  
  const flightTime = distance / (shellType.velocity * Math.cos(elevation * Math.PI / 180));
  
  return { azimuth, elevation, distance, flightTime };
}

function formatCoord(value: number): string {
  return value.toFixed(0).padStart(3, '0');
}

function formatAngle(angle: number): string {
  const deg = Math.floor(angle);
  const min = Math.floor((angle - deg) * 60);
  const sec = Math.floor(((angle - deg) * 60 - min) * 60);
  return `${deg}° ${min}' ${sec}"`;
}

// ИИ-анализ
function analyzeTarget(target: TargetData, gunPos: Point, terrain: string): AIRecommendation {
  const distance = Math.sqrt(
    Math.pow(target.position.x - gunPos.x, 2) + 
    Math.pow(target.position.y - gunPos.y, 2)
  );
  
  let selectedShell: ShellType;
  let confidence: number;
  let reason: string;
  let effectiveness: number;
  
  // Анализ типа цели
  if (target.type === 'tank' || (target.armor && target.armor > 100)) {
    if (distance < 400) {
      selectedShell = SHELL_TYPES[1]; // AP
      confidence = 95;
      reason = 'Тяжёлая броня на ближней дистанции — бронебойный оптимально';
      effectiveness = 98;
    } else {
      selectedShell = SHELL_TYPES[2]; // HEAT
      confidence = 88;
      reason = 'Тяжёлая броня на средней дистанции — кумулятивный эффективнее';
      effectiveness = 85;
    }
  } else if (target.type === 'infantry' || (target.armor && target.armor < 50)) {
    selectedShell = SHELL_TYPES[0]; // HE
    confidence = 92;
    reason = 'Пехота/лёгкая техника — осколочно-фугасный с большим радиусом поражения';
    effectiveness = 95;
  } else if (target.type === 'building') {
    selectedShell = SHELL_TYPES[0]; // HE
    confidence = 90;
    reason = 'Здания разрушаются ОФ-снарядами';
    effectiveness = 90;
  } else {
    // Неизвестная цель — универсальный выбор
    selectedShell = SHELL_TYPES[0]; // HE
    confidence = 75;
    reason = 'Неизвестный тип цели — рекомендуется универсальный ОФ';
    effectiveness = 80;
  }
  
  // Анализ дистанции
  if (distance > selectedShell.effectiveRange) {
    confidence -= 20;
    reason += ' [ВНИМАНИЕ: цель за пределами эффективной дальности]';
    effectiveness -= 30;
  }
  
  // Анализ местности
  let terrainAnalysis = '';
  if (terrain === 'urban') {
    terrainAnalysis = 'Городская застройка: повышенный риск рикошета для ББ, рекомендуется ОФ';
    if (selectedShell.type === 'AP') {
      selectedShell = SHELL_TYPES[0];
      reason = 'Городская местность — ОФ эффективнее из-за риска рикошета';
      confidence -= 10;
    }
  } else if (terrain === 'open') {
    terrainAnalysis = 'Открытая местность: все типы снарядов эффективны';
  } else if (terrain === 'forest') {
    terrainAnalysis = 'Лесная местность: дымовые снаряды могут блокировать обзор';
    if (selectedShell.type === 'SMOKE') {
      confidence -= 30;
      reason += ' [Дым в лесу неэффективен]';
    }
  }
  
  // Приоритет цели
  if (target.priority === 'high') {
    effectiveness = Math.min(100, effectiveness + 10);
  }
  
  return {
    shellType: selectedShell,
    confidence,
    reason,
    terrainAnalysis,
    effectiveness
  };
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gunPosition, setGunPosition] = useState<Point>({ x: 500, y: 500 });
  const [targetPosition, setTargetPosition] = useState<Point | null>(null);
  const [targetData, setTargetData] = useState<TargetData | null>(null);
  const [isDragging, setIsDragging] = useState<'gun' | 'target' | null>(null);
  const [fireSolution, setFireSolution] = useState<FireSolution | null>(null);
  const [selectedShell, setSelectedShell] = useState<ShellType>(SHELL_TYPES[0]);
  const [aiRecommendation, setAiRecommendation] = useState<AIRecommendation | null>(null);
  const [showTrajectory, setShowTrajectory] = useState(true);
  const [windSpeed, setWindSpeed] = useState(0);
  const [windDirection, setWindDirection] = useState(0);
  const [firing, setFiring] = useState(false);
  const [shellPos, setShellPos] = useState<Point | null>(null);
  const [history, setHistory] = useState<Point[]>([]);
  const [autoAim, setAutoAim] = useState(false);
  const [manualCoords, setManualCoords] = useState({ x: '', y: '' });
  const [targetType, setTargetType] = useState<string>('unknown');
  const [targetArmor, setTargetArmor] = useState<number>(0);
  const [terrain, setTerrain] = useState<string>('open');
  const [aiEnabled, setAiEnabled] = useState(true);
  const animFrameRef = useRef<number>(0);

  // Автонаводка по координатам
  const applyManualCoords = () => {
    const x = parseInt(manualCoords.x);
    const y = parseInt(manualCoords.y);
    if (!isNaN(x) && !isNaN(y) && x >= 0 && x <= MAP_SIZE && y >= 0 && y <= MAP_SIZE) {
      const newPos = { x, y };
      setTargetPosition(newPos);
      setTargetData({
        position: newPos,
        type: targetType,
        armor: targetArmor,
        priority: 'medium'
      });
    }
  };

  // ИИ-анализ при изменении цели
  useEffect(() => {
    if (targetData && aiEnabled) {
      const recommendation = analyzeTarget(targetData, gunPosition, terrain);
      setAiRecommendation(recommendation);
      if (autoAim) {
        setSelectedShell(recommendation.shellType);
      }
    }
  }, [targetData, gunPosition, terrain, autoAim, aiEnabled]);

  // Расчёт решения
  useEffect(() => {
    if (targetPosition) {
      const solution = calculateFireSolution(gunPosition, targetPosition, selectedShell);
      setFireSolution(solution);
    } else {
      setFireSolution(null);
    }
  }, [gunPosition, targetPosition, selectedShell]);

  // Отрисовка карты
  const drawMap = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const scale = w / MAP_SIZE;

    // Фон
    ctx.fillStyle = '#0a1a0a';
    ctx.fillRect(0, 0, w, h);

    // Сетка
    ctx.strokeStyle = '#1a3a1a';
    ctx.lineWidth = 0.5;
    
    for (let i = 0; i <= MAP_SIZE; i += GRID_SIZE) {
      const pos = i * scale;
      ctx.beginPath();
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos, h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, pos);
      ctx.lineTo(w, pos);
      ctx.stroke();
    }

    // Координатные метки
    ctx.fillStyle = '#2a5a2a';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    for (let i = 0; i <= MAP_SIZE; i += GRID_SIZE * 2) {
      const pos = i * scale;
      ctx.fillText(`${formatCoord(i)}`, pos, 12);
      ctx.textAlign = 'left';
      ctx.fillText(`${formatCoord(i)}`, 2, pos + 4);
      ctx.textAlign = 'center';
    }

    // Линия прицеливания
    if (targetPosition && fireSolution) {
      ctx.strokeStyle = '#ff3333';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(gunPosition.x * scale, gunPosition.y * scale);
      ctx.lineTo(targetPosition.x * scale, targetPosition.y * scale);
      ctx.stroke();
      ctx.setLineDash([]);

      // Траектория
      if (showTrajectory) {
        const steps = 50;
        const dx = targetPosition.x - gunPosition.x;
        const dy = targetPosition.y - gunPosition.y;
        
        ctx.strokeStyle = '#ffaa00';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const px = gunPosition.x + dx * t;
          const py = gunPosition.y + dy * t;
          const height = 4 * fireSolution.elevation * t * (1 - t) * 0.3;
          const screenX = px * scale;
          const screenY = py * scale - height * scale;
          
          if (i === 0) ctx.moveTo(screenX, screenY);
          else ctx.lineTo(screenX, screenY);
        }
        ctx.stroke();
      }

      // Круг рассеивания
      ctx.strokeStyle = 'rgba(255, 50, 50, 0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const spread = 15 + fireSolution.distance * 0.02;
      ctx.arc(targetPosition.x * scale, targetPosition.y * scale, spread * scale, 0, Math.PI * 2);
      ctx.stroke();
    }

    // История
    history.forEach((pos, idx) => {
      ctx.fillStyle = `rgba(255, 100, 0, ${0.3 + idx * 0.1})`;
      ctx.beginPath();
      ctx.arc(pos.x * scale, pos.y * scale, 4, 0, Math.PI * 2);
      ctx.fill();
    });

    // Снаряд
    if (shellPos) {
      ctx.fillStyle = '#ffff00';
      ctx.beginPath();
      ctx.arc(shellPos.x * scale, shellPos.y * scale, 4, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = 'rgba(255, 255, 0, 0.3)';
      ctx.beginPath();
      ctx.arc(shellPos.x * scale, shellPos.y * scale, 8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Орудие
    const gunX = gunPosition.x * scale;
    const gunY = gunPosition.y * scale;
    
    ctx.fillStyle = 'rgba(0, 255, 100, 0.2)';
    ctx.beginPath();
    ctx.arc(gunX, gunY, 20, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#00ff66';
    ctx.beginPath();
    ctx.arc(gunX, gunY, 8, 0, Math.PI * 2);
    ctx.fill();
    
    if (fireSolution) {
      const angle = (fireSolution.azimuth - 90) * Math.PI / 180;
      ctx.strokeStyle = '#00ff66';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(gunX, gunY);
      ctx.lineTo(gunX + Math.cos(angle) * 20, gunY + Math.sin(angle) * 20);
      ctx.stroke();
    }
    
    ctx.fillStyle = '#00ff66';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ОРУДИЕ', gunX, gunY - 14);
    ctx.font = '9px monospace';
    ctx.fillText(`[${formatCoord(gunPosition.x)}, ${formatCoord(gunPosition.y)}]`, gunX, gunY + 22);

    // Цель
    if (targetPosition) {
      const tX = targetPosition.x * scale;
      const tY = targetPosition.y * scale;
      
      ctx.strokeStyle = '#ff3333';
      ctx.lineWidth = 2;
      const crossSize = 12;
      ctx.beginPath();
      ctx.moveTo(tX - crossSize, tY);
      ctx.lineTo(tX + crossSize, tY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(tX, tY - crossSize);
      ctx.lineTo(tX, tY + crossSize);
      ctx.stroke();
      
      ctx.beginPath();
      ctx.arc(tX, tY, 10, 0, Math.PI * 2);
      ctx.stroke();
      
      ctx.fillStyle = '#ff3333';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('ЦЕЛЬ', tX, tY - 16);
      ctx.font = '9px monospace';
      ctx.fillText(`[${formatCoord(targetPosition.x)}, ${formatCoord(targetPosition.y)}]`, tX, tY + 24);
    }

    // Рамка
    ctx.strokeStyle = '#33ff33';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, w - 2, h - 2);

    // Scanlines
    ctx.fillStyle = 'rgba(0, 0, 0, 0.03)';
    for (let i = 0; i < h; i += 2) {
      ctx.fillRect(0, i, w, 1);
    }

  }, [gunPosition, targetPosition, fireSolution, showTrajectory, history, shellPos]);

  useEffect(() => {
    drawMap();
  }, [drawMap]);

  // Обработка кликов
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width * MAP_SIZE;
    const y = (e.clientY - rect.top) / rect.height * MAP_SIZE;
    
    const clickX = Math.round(x);
    const clickY = Math.round(y);

    const dxGun = clickX - gunPosition.x;
    const dyGun = clickY - gunPosition.y;
    if (Math.sqrt(dxGun * dxGun + dyGun * dyGun) < 25) {
      setIsDragging('gun');
      return;
    }

    if (targetPosition) {
      const dxT = clickX - targetPosition.x;
      const dyT = clickY - targetPosition.y;
      if (Math.sqrt(dxT * dxT + dyT * dyT) < 25) {
        setIsDragging('target');
        return;
      }
    }

    const newPos = { x: clickX, y: clickY };
    setTargetPosition(newPos);
    setTargetData({
      position: newPos,
      type: targetType,
      armor: targetArmor,
      priority: 'medium'
    });
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = Math.round((e.clientX - rect.left) / rect.width * MAP_SIZE);
    const y = Math.round((e.clientY - rect.top) / rect.height * MAP_SIZE);
    
    const pos = { x: Math.max(0, Math.min(MAP_SIZE, x)), y: Math.max(0, Math.min(MAP_SIZE, y)) };
    
    if (isDragging === 'gun') setGunPosition(pos);
    else if (isDragging === 'target') {
      setTargetPosition(pos);
      if (targetData) {
        setTargetData({ ...targetData, position: pos });
      }
    }
  };

  const handleCanvasMouseUp = () => {
    setIsDragging(null);
  };

  // Выстрел
  const fire = () => {
    if (!targetPosition || !fireSolution) return;
    setFiring(true);
    
    const startTime = Date.now();
    const duration = fireSolution.flightTime * 1000;
    const startPos = { ...gunPosition };
    const endPos = { ...targetPosition };
    
    const windOffset = windSpeed * 0.5;
    const windRad = windDirection * Math.PI / 180;
    const impactX = endPos.x + Math.sin(windRad) * windOffset;
    const impactY = endPos.y + Math.cos(windRad) * windOffset;
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(1, elapsed / duration);
      
      const px = startPos.x + (impactX - startPos.x) * t;
      const py = startPos.y + (impactY - startPos.y) * t;
      setShellPos({ x: px, y: py });
      
      if (t < 1) {
        animFrameRef.current = requestAnimationFrame(animate);
      } else {
        setShellPos(null);
        setFiring(false);
        setHistory(prev => [...prev, { x: impactX, y: impactY }]);
      }
    };
    
    animFrameRef.current = requestAnimationFrame(animate);
  };

  const clearHistory = () => setHistory([]);
  const clearTarget = () => {
    setTargetPosition(null);
    setTargetData(null);
    setFireSolution(null);
    setAiRecommendation(null);
    setHistory([]);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-green-400 font-mono flex flex-col">
      {/* Header */}
      <header className="border-b border-green-900 bg-[#0d1a0d] px-4 py-3">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
            <h1 className="text-xl font-bold text-green-300 tracking-wider">
              ◈ MTC ART COMPUTER v3.0 PRO
            </h1>
          </div>
          <div className="text-xs text-green-600 flex gap-4">
            <span>ИИ: <span className={aiEnabled ? 'text-green-400' : 'text-red-400'}>{aiEnabled ? 'АКТИВЕН' : 'ВЫКЛ'}</span></span>
            <span>АВТОНАВОДКА: <span className={autoAim ? 'text-yellow-400' : 'text-green-600'}>{autoAim ? 'ВКЛ' : 'ВЫКЛ'}</span></span>
            <span>СТАТУС: <span className="text-green-400">ГОТОВ</span></span>
          </div>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row gap-4 p-4 max-w-7xl mx-auto w-full">
        {/* Карта */}
        <div className="flex-1 flex flex-col">
          <div className="border border-green-900 rounded bg-[#0a1a0a] p-1 flex-1">
            <div className="text-xs text-green-600 px-2 py-1 border-b border-green-900 flex justify-between">
              <span>ТАКТИЧЕСКАЯ КАРТА</span>
              <span>МАСШТАБ: 1:{MAP_SIZE / 10} | СЕТКА: {GRID_SIZE}м</span>
            </div>
            <canvas
              ref={canvasRef}
              width={600}
              height={600}
              className="w-full aspect-square cursor-crosshair"
              onClick={handleCanvasClick}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={handleCanvasMouseUp}
            />
            <div className="text-xs text-green-700 px-2 py-1 border-t border-green-900">
              ЛКМ — метка цели | Перетаскивание — переместить
            </div>
          </div>
        </div>

        {/* Панель управления */}
        <div className="lg:w-96 flex flex-col gap-4">
          {/* Автонаводка */}
          <div className="border border-yellow-900 rounded bg-[#1a1a0d] p-4">
            <h2 className="text-sm font-bold text-yellow-300 mb-3 border-b border-yellow-900 pb-2 flex justify-between">
              <span>▸ АВТОНАВОДКА ПО КООРДИНАТАМ</span>
              <button
                onClick={() => setAutoAim(!autoAim)}
                className={`px-2 py-0.5 rounded text-xs ${
                  autoAim ? 'bg-yellow-700 text-yellow-100' : 'bg-yellow-950 text-yellow-700'
                }`}
              >
                {autoAim ? 'ВКЛ' : 'ВЫКЛ'}
              </button>
            </h2>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div>
                <label className="text-xs text-yellow-600">X:</label>
                <input
                  type="number"
                  value={manualCoords.x}
                  onChange={(e) => setManualCoords(prev => ({ ...prev, x: e.target.value }))}
                  placeholder="0-1000"
                  className="w-full bg-yellow-950 border border-yellow-900 rounded px-2 py-1 text-yellow-300 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-yellow-600">Y:</label>
                <input
                  type="number"
                  value={manualCoords.y}
                  onChange={(e) => setManualCoords(prev => ({ ...prev, y: e.target.value }))}
                  placeholder="0-1000"
                  className="w-full bg-yellow-950 border border-yellow-900 rounded px-2 py-1 text-yellow-300 text-sm"
                />
              </div>
            </div>
            <button
              onClick={applyManualCoords}
              className="w-full py-2 rounded bg-yellow-800 hover:bg-yellow-700 text-yellow-100 text-sm font-bold transition-all"
            >
              ◉ НАВЕСТИ ПО КООРДИНАТАМ
            </button>
          </div>

          {/* ИИ-анализ */}
          {aiEnabled && aiRecommendation && (
            <div className="border border-cyan-900 rounded bg-[#0d1a1a] p-4">
              <h2 className="text-sm font-bold text-cyan-300 mb-3 border-b border-cyan-900 pb-2">
                ◈ ИИ-АНАЛИЗ ЦЕЛИ
              </h2>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-cyan-600">РЕКОМЕНДУЕМЫЙ СНАРЯД:</span>
                  <span className="text-cyan-300 font-bold">{aiRecommendation.shellType.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-cyan-600">УВЕРЕННОСТЬ:</span>
                  <span className={`font-bold ${
                    aiRecommendation.confidence > 85 ? 'text-green-400' :
                    aiRecommendation.confidence > 70 ? 'text-yellow-400' : 'text-red-400'
                  }`}>{aiRecommendation.confidence}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-cyan-600">ЭФФЕКТИВНОСТЬ:</span>
                  <span className="text-cyan-300 font-bold">{aiRecommendation.effectiveness}%</span>
                </div>
                <div className="mt-2 p-2 bg-cyan-950 rounded border border-cyan-900">
                  <div className="text-cyan-400 mb-1">▸ Анализ:</div>
                  <div className="text-cyan-300">{aiRecommendation.reason}</div>
                </div>
                {aiRecommendation.terrainAnalysis && (
                  <div className="mt-2 p-2 bg-cyan-950 rounded border border-cyan-900">
                    <div className="text-cyan-400 mb-1">▸ Местность:</div>
                    <div className="text-cyan-300">{aiRecommendation.terrainAnalysis}</div>
                  </div>
                )}
                {autoAim && (
                  <div className="mt-2 p-2 bg-yellow-950 rounded border border-yellow-800 text-yellow-300">
                    ⚡ АВТОНАВОДКА: снаряд выбран автоматически
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Решение */}
          <div className="border border-green-900 rounded bg-[#0d1a0d] p-4">
            <h2 className="text-sm font-bold text-green-300 mb-3 border-b border-green-900 pb-2">
              ▸ РЕШЕНИЕ ДЛЯ СТРЕЛЬБЫ
            </h2>
            
            {fireSolution ? (
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-green-600 text-xs">АЗИМУТ:</span>
                  <span className="text-green-300 text-lg font-bold">{formatAngle(fireSolution.azimuth)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-green-600 text-xs">УГОЛ МЕСТА:</span>
                  <span className="text-green-300 text-lg font-bold">{fireSolution.elevation.toFixed(1)}°</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-green-600 text-xs">ДАЛЬНОСТЬ:</span>
                  <span className="text-yellow-400 text-lg font-bold">{fireSolution.distance.toFixed(0)} м</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-green-600 text-xs">ВРЕМЯ ПОЛЁТА:</span>
                  <span className="text-green-300 text-lg font-bold">{fireSolution.flightTime.toFixed(2)} с</span>
                </div>
              </div>
            ) : (
              <div className="text-green-700 text-center py-4 text-sm">
                ⚠ ЦЕЛЬ НЕ УСТАНОВЛЕНА
              </div>
            )}
          </div>

          {/* Выбор снаряда */}
          <div className="border border-green-900 rounded bg-[#0d1a0d] p-4">
            <h2 className="text-sm font-bold text-green-300 mb-3 border-b border-green-900 pb-2">
              ▸ ТИП СНАРЯДА
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {SHELL_TYPES.map(shell => (
                <button
                  key={shell.id}
                  onClick={() => setSelectedShell(shell)}
                  className={`p-2 rounded border text-xs transition-all ${
                    selectedShell.id === shell.id
                      ? 'bg-green-900 border-green-500 text-green-200'
                      : 'bg-green-950 border-green-900 text-green-600 hover:bg-green-900'
                  }`}
                >
                  <div className="font-bold">{shell.name}</div>
                  <div className="text-[10px] mt-1">{shell.type}</div>
                  {aiRecommendation?.shellType.id === shell.id && aiEnabled && (
                    <div className="text-cyan-400 text-[10px] mt-1">◈ ИИ</div>
                  )}
                </button>
              ))}
            </div>
            <div className="mt-2 p-2 bg-green-950 rounded text-xs text-green-400">
              {selectedShell.description}
            </div>
          </div>

          {/* Параметры цели */}
          <div className="border border-green-900 rounded bg-[#0d1a0d] p-4">
            <h2 className="text-sm font-bold text-green-300 mb-3 border-b border-green-900 pb-2">
              ▸ ДАННЫЕ ЦЕЛИ
            </h2>
            <div className="space-y-2">
              <div>
                <label className="text-xs text-green-600">ТИП ЦЕЛИ:</label>
                <select
                  value={targetType}
                  onChange={(e) => {
                    setTargetType(e.target.value);
                    if (targetData) {
                      setTargetData({ ...targetData, type: e.target.value });
                    }
                  }}
                  className="w-full bg-green-950 border border-green-900 rounded px-2 py-1 text-green-300 text-sm"
                >
                  <option value="unknown">Неизвестно</option>
                  <option value="infantry">Пехота</option>
                  <option value="tank">Танк</option>
                  <option value="building">Здание</option>
                  <option value="light_vehicle">Лёгкая техника</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-green-600">БРОНЯ (0-200):</label>
                <input
                  type="number"
                  value={targetArmor}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setTargetArmor(val);
                    if (targetData) {
                      setTargetData({ ...targetData, armor: val });
                    }
                  }}
                  min="0"
                  max="200"
                  className="w-full bg-green-950 border border-green-900 rounded px-2 py-1 text-green-300 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-green-600">МЕСТНОСТЬ:</label>
                <select
                  value={terrain}
                  onChange={(e) => setTerrain(e.target.value)}
                  className="w-full bg-green-950 border border-green-900 rounded px-2 py-1 text-green-300 text-sm"
                >
                  <option value="open">Открытая</option>
                  <option value="urban">Городская</option>
                  <option value="forest">Лесная</option>
                </select>
              </div>
            </div>
          </div>

          {/* Ветер */}
          <div className="border border-green-900 rounded bg-[#0d1a0d] p-4">
            <h2 className="text-sm font-bold text-green-300 mb-3 border-b border-green-900 pb-2">
              ▸ МЕТЕОРОЛОГИЯ
            </h2>
            <div className="space-y-2">
              <div>
                <label className="text-xs text-green-600">ВЕТЕР (м/с): {windSpeed}</label>
                <input
                  type="range"
                  min="0"
                  max="30"
                  value={windSpeed}
                  onChange={(e) => setWindSpeed(Number(e.target.value))}
                  className="w-full"
                />
              </div>
              <div>
                <label className="text-xs text-green-600">НАПРАВЛЕНИЕ: {windDirection}°</label>
                <input
                  type="range"
                  min="0"
                  max="359"
                  value={windDirection}
                  onChange={(e) => setWindDirection(Number(e.target.value))}
                  className="w-full"
                />
              </div>
            </div>
          </div>

          {/* Кнопки */}
          <div className="border border-green-900 rounded bg-[#0d1a0d] p-4">
            <div className="space-y-2">
              <button
                onClick={fire}
                disabled={!targetPosition || firing}
                className={`w-full py-3 rounded font-bold text-sm tracking-wider transition-all ${
                  !targetPosition || firing
                    ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                    : 'bg-red-900 hover:bg-red-700 text-red-200 border border-red-600 shadow-lg shadow-red-900/50 active:scale-95'
                }`}
              >
                {firing ? '◉ ВЫСТРЕЛ...' : '◆ ОГОНЬ'}
              </button>
              
              <div className="flex gap-2">
                <button
                  onClick={() => setAiEnabled(!aiEnabled)}
                  className={`flex-1 py-2 rounded text-xs border transition-all ${
                    aiEnabled
                      ? 'bg-cyan-900 border-cyan-600 text-cyan-300'
                      : 'bg-cyan-950 border-cyan-900 text-cyan-700'
                  }`}
                >
                  ◈ ИИ: {aiEnabled ? 'ВКЛ' : 'ВЫКЛ'}
                </button>
                <button
                  onClick={() => setShowTrajectory(!showTrajectory)}
                  className={`flex-1 py-2 rounded text-xs border transition-all ${
                    showTrajectory
                      ? 'bg-green-900 border-green-600 text-green-300'
                      : 'bg-green-950 border-green-900 text-green-700'
                  }`}
                >
                  {showTrajectory ? '◉ ТРАЕКТОРИЯ' : '○ ТРАЕКТОРИЯ'}
                </button>
              </div>
              
              <div className="flex gap-2">
                <button
                  onClick={clearTarget}
                  className="flex-1 py-2 rounded text-xs border border-green-900 bg-green-950 text-green-700 hover:bg-green-900 transition-all"
                >
                  ✕ СБРОС ЦЕЛИ
                </button>
                <button
                  onClick={clearHistory}
                  className="flex-1 py-2 rounded text-xs border border-green-900 bg-green-950 text-green-700 hover:bg-green-900 transition-all"
                >
                  ОЧИСТИТЬ ИСТОРИЮ
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-green-900 bg-[#0d1a0d] px-4 py-2">
        <div className="flex justify-between items-center max-w-7xl mx-auto text-xs text-green-700">
          <span>MTC ARTILLERY FIRE CONTROL SYSTEM v3.0</span>
          <span>ИИ-МОДУЛЬ АКТИВЕН | АВТОНАВОДКА</span>
          <span>© ART-COMPUTER PRO 2024</span>
        </div>
      </footer>
    </div>
  );
}

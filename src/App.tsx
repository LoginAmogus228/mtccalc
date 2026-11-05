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

// Баллистические константы (стилизованные под MTC)
const GRAVITY = 196.2; // studs/s² (Roblox gravity)
const MUZZLE_VELOCITY = 300; // studs/s
const GUN_POSITION_DEFAULT: Point = { x: 500, y: 500 };
const MAP_SIZE = 1000; // studs
const GRID_SIZE = 100; // studs per grid cell

function calculateFireSolution(gunPos: Point, targetPos: Point): FireSolution {
  const dx = targetPos.x - gunPos.x;
  const dy = targetPos.y - gunPos.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  
  // Азимут (0° = север, по часовой стрелке)
  let azimuth = Math.atan2(dx, -dy) * (180 / Math.PI);
  if (azimuth < 0) azimuth += 360;
  
  // Угол возвышения (упрощённая баллистика)
  // θ = arcsin(v² ± sqrt(v⁴ - g(gv² + 2d²... )) / gd)
  // Упрощённо: используем малый угол для дальних дистанций
  const v2 = MUZZLE_VELOCITY * MUZZLE_VELOCITY;
  const discriminant = v2 * v2 - GRAVITY * (GRAVITY * distance * distance);
  
  let elevation: number;
  if (discriminant < 0 || distance > v2 / GRAVITY) {
    // Цель вне досягаемости
    elevation = 45; // Максимальный угол
  } else {
    // Настильная траектория (малый угол)
    elevation = 0.5 * Math.asin(GRAVITY * distance / v2) * (180 / Math.PI);
  }
  
  // Время полёта
  const flightTime = distance / (MUZZLE_VELOCITY * Math.cos(elevation * Math.PI / 180));
  
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

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gunPosition, setGunPosition] = useState<Point>(GUN_POSITION_DEFAULT);
  const [targetPosition, setTargetPosition] = useState<Point | null>(null);
  const [isDragging, setIsDragging] = useState<'gun' | 'target' | null>(null);
  const [fireSolution, setFireSolution] = useState<FireSolution | null>(null);
  const [showTrajectory, setShowTrajectory] = useState(true);
  const [windSpeed, setWindSpeed] = useState(0);
  const [windDirection, setWindDirection] = useState(0);
  const [firing, setFiring] = useState(false);
  const [shellPos, setShellPos] = useState<Point | null>(null);
  const [history, setHistory] = useState<Point[]>([]);
  const animFrameRef = useRef<number>(0);

  // Расчёт решения при изменении позиций
  useEffect(() => {
    if (targetPosition) {
      const solution = calculateFireSolution(gunPosition, targetPosition);
      setFireSolution(solution);
    } else {
      setFireSolution(null);
    }
  }, [gunPosition, targetPosition]);

  // Отрисовка карты
  const drawMap = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // Фон — тёмный зелёный как CRT
    ctx.fillStyle = '#0a1a0a';
    ctx.fillRect(0, 0, w, h);

    // Сетка
    ctx.strokeStyle = '#1a3a1a';
    ctx.lineWidth = 0.5;
    const scale = w / MAP_SIZE;
    
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

      // Траектория снаряда
      if (showTrajectory) {
        const steps = 50;
        const dx = targetPosition.x - gunPosition.x;
        const dy = targetPosition.y - gunPosition.y;
        const dist = fireSolution.distance;
        
        ctx.strokeStyle = '#ffaa00';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const px = gunPosition.x + dx * t;
          const py = gunPosition.y + dy * t;
          // Высота (парабола)
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

    // История попаданий
    history.forEach((pos, idx) => {
      ctx.fillStyle = `rgba(255, 100, 0, ${0.3 + idx * 0.1})`;
      ctx.beginPath();
      ctx.arc(pos.x * scale, pos.y * scale, 4, 0, Math.PI * 2);
      ctx.fill();
    });

    // Позиция снаряда в полёте
    if (shellPos) {
      ctx.fillStyle = '#ffff00';
      ctx.beginPath();
      ctx.arc(shellPos.x * scale, shellPos.y * scale, 4, 0, Math.PI * 2);
      ctx.fill();
      
      // Свечение
      ctx.fillStyle = 'rgba(255, 255, 0, 0.3)';
      ctx.beginPath();
      ctx.arc(shellPos.x * scale, shellPos.y * scale, 8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Орудие
    const gunX = gunPosition.x * scale;
    const gunY = gunPosition.y * scale;
    
    // Свечение орудия
    ctx.fillStyle = 'rgba(0, 255, 100, 0.2)';
    ctx.beginPath();
    ctx.arc(gunX, gunY, 20, 0, Math.PI * 2);
    ctx.fill();
    
    // Корпус орудия
    ctx.fillStyle = '#00ff66';
    ctx.beginPath();
    ctx.arc(gunX, gunY, 8, 0, Math.PI * 2);
    ctx.fill();
    
    // Ствол (направлен на цель)
    if (fireSolution) {
      const angle = (fireSolution.azimuth - 90) * Math.PI / 180;
      ctx.strokeStyle = '#00ff66';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(gunX, gunY);
      ctx.lineTo(gunX + Math.cos(angle) * 20, gunY + Math.sin(angle) * 20);
      ctx.stroke();
    }
    
    // Подпись
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
      
      // Перекрестие
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
      
      // Круг
      ctx.beginPath();
      ctx.arc(tX, tY, 10, 0, Math.PI * 2);
      ctx.stroke();
      
      // Подпись
      ctx.fillStyle = '#ff3333';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('ЦЕЛЬ', tX, tY - 16);
      ctx.font = '9px monospace';
      ctx.fillText(`[${formatCoord(targetPosition.x)}, ${formatCoord(targetPosition.y)}]`, tX, tY + 24);
    }

    // Рамка CRT
    ctx.strokeStyle = '#33ff33';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, w - 2, h - 2);

    // Scanlines эффект
    ctx.fillStyle = 'rgba(0, 0, 0, 0.03)';
    for (let i = 0; i < h; i += 2) {
      ctx.fillRect(0, i, w, 1);
    }

  }, [gunPosition, targetPosition, fireSolution, showTrajectory, history, shellPos]);

  useEffect(() => {
    drawMap();
  }, [drawMap]);

  // Обработка кликов на карте
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const scale = canvas.width / MAP_SIZE;
    const x = (e.clientX - rect.left) / scale * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) / scale * (canvas.height / rect.height);
    
    const clickX = Math.max(0, Math.min(MAP_SIZE, x / (canvas.width / MAP_SIZE)));
    const clickY = Math.max(0, Math.min(MAP_SIZE, y / (canvas.height / MAP_SIZE)));

    // Проверка — клик на орудие?
    const dxGun = clickX - gunPosition.x;
    const dyGun = clickY - gunPosition.y;
    if (Math.sqrt(dxGun * dxGun + dyGun * dyGun) < 25) {
      setIsDragging('gun');
      return;
    }

    // Проверка — клик на цель?
    if (targetPosition) {
      const dxT = clickX - targetPosition.x;
      const dyT = clickY - targetPosition.y;
      if (Math.sqrt(dxT * dxT + dyT * dyT) < 25) {
        setIsDragging('target');
        return;
      }
    }

    // Новая цель
    setTargetPosition({ x: Math.round(clickX), y: Math.round(clickY) });
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width * MAP_SIZE;
    const y = (e.clientY - rect.top) / rect.height * MAP_SIZE;
    
    const pos = { x: Math.max(0, Math.min(MAP_SIZE, Math.round(x))), y: Math.max(0, Math.min(MAP_SIZE, Math.round(y))) };
    
    if (isDragging === 'gun') setGunPosition(pos);
    else if (isDragging === 'target') setTargetPosition(pos);
  };

  const handleCanvasMouseUp = () => {
    setIsDragging(null);
  };

  // Анимация выстрела
  const fire = () => {
    if (!targetPosition || !fireSolution) return;
    setFiring(true);
    
    const startTime = Date.now();
    const duration = fireSolution.flightTime * 1000;
    const startPos = { ...gunPosition };
    const endPos = { ...targetPosition };
    
    // Добавляем разброс от ветра
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
    setFireSolution(null);
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
              ◈ MTC ART COMPUTER v2.4
            </h1>
          </div>
          <div className="text-xs text-green-600">
            СИСТЕМА НАВЕДЕНИЯ | СТАТУС: <span className="text-green-400">АКТИВНА</span>
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
              ЛКМ — поставить метку цели | Перетаскивание — переместить орудие/цель
            </div>
          </div>
        </div>

        {/* Панель управления */}
        <div className="lg:w-80 flex flex-col gap-4">
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

                {/* Индикатор досягаемости */}
                <div className="mt-2">
                  <div className="text-xs text-green-600 mb-1">ДАЛЬНОСТЬ СТРЕЛЬБЫ:</div>
                  <div className="w-full bg-green-950 rounded h-3 border border-green-900">
                    <div 
                      className={`h-full rounded transition-all ${
                        fireSolution.distance > MUZZLE_VELOCITY * MUZZLE_VELOCITY / GRAVITY * 0.8
                          ? 'bg-red-500' 
                          : fireSolution.distance > MUZZLE_VELOCITY * MUZZLE_VELOCITY / GRAVITY * 0.5
                          ? 'bg-yellow-500'
                          : 'bg-green-500'
                      }`}
                      style={{ width: `${Math.min(100, (fireSolution.distance / (MUZZLE_VELOCITY * MUZZLE_VELOCITY / GRAVITY)) * 100)}%` }}
                    ></div>
                  </div>
                  <div className="flex justify-between text-xs text-green-700 mt-1">
                    <span>0</span>
                    <span>{(MUZZLE_VELOCITY * MUZZLE_VELOCITY / GRAVITY).toFixed(0)}м MAX</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-green-700 text-center py-8 text-sm">
                ⚠ ЦЕЛЬ НЕ ОБНАРУЖЕНА
                <br />
                <span className="text-xs">Кликните по карте для установки метки</span>
              </div>
            )}
          </div>

          {/* Позиция орудия */}
          <div className="border border-green-900 rounded bg-[#0d1a0d] p-4">
            <h2 className="text-sm font-bold text-green-300 mb-3 border-b border-green-900 pb-2">
              ▸ ПОЗИЦИЯ ОРУДИЯ
            </h2>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-green-600">X:</label>
                <input
                  type="number"
                  value={gunPosition.x}
                  onChange={(e) => setGunPosition(prev => ({ ...prev, x: Number(e.target.value) }))}
                  className="w-full bg-green-950 border border-green-900 rounded px-2 py-1 text-green-300 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-green-600">Y:</label>
                <input
                  type="number"
                  value={gunPosition.y}
                  onChange={(e) => setGunPosition(prev => ({ ...prev, y: Number(e.target.value) }))}
                  className="w-full bg-green-950 border border-green-900 rounded px-2 py-1 text-green-300 text-sm"
                />
              </div>
            </div>
            {targetPosition && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-red-400">ЦЕЛЬ X:</label>
                  <input
                    type="number"
                    value={targetPosition.x}
                    onChange={(e) => setTargetPosition(prev => prev ? { ...prev, x: Number(e.target.value) } : null)}
                    className="w-full bg-green-950 border border-red-900 rounded px-2 py-1 text-red-300 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-red-400">ЦЕЛЬ Y:</label>
                  <input
                    type="number"
                    value={targetPosition.y}
                    onChange={(e) => setTargetPosition(prev => prev ? { ...prev, y: Number(e.target.value) } : null)}
                    className="w-full bg-green-950 border border-red-900 rounded px-2 py-1 text-red-300 text-sm"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Ветер */}
          <div className="border border-green-900 rounded bg-[#0d1a0d] p-4">
            <h2 className="text-sm font-bold text-green-300 mb-3 border-b border-green-900 pb-2">
              ▸ МЕТЕОРОЛОГИЯ
            </h2>
            <div className="space-y-2">
              <div>
                <label className="text-xs text-green-600">СКОРОСТЬ ВЕТРА (м/с):</label>
                <input
                  type="range"
                  min="0"
                  max="30"
                  value={windSpeed}
                  onChange={(e) => setWindSpeed(Number(e.target.value))}
                  className="w-full accent-green-500"
                />
                <span className="text-xs text-green-400">{windSpeed} м/с</span>
              </div>
              <div>
                <label className="text-xs text-green-600">НАПРАВЛЕНИЕ ВЕТРА:</label>
                <input
                  type="range"
                  min="0"
                  max="359"
                  value={windDirection}
                  onChange={(e) => setWindDirection(Number(e.target.value))}
                  className="w-full accent-green-500"
                />
                <span className="text-xs text-green-400">{windDirection}°</span>
              </div>
            </div>
          </div>

          {/* Кнопки управления */}
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
                  onClick={() => setShowTrajectory(!showTrajectory)}
                  className={`flex-1 py-2 rounded text-xs border transition-all ${
                    showTrajectory
                      ? 'bg-green-900 border-green-600 text-green-300'
                      : 'bg-green-950 border-green-900 text-green-700'
                  }`}
                >
                  {showTrajectory ? '◉ ТРАЕКТОРИЯ' : '○ ТРАЕКТОРИЯ'}
                </button>
                <button
                  onClick={clearTarget}
                  className="flex-1 py-2 rounded text-xs border border-green-900 bg-green-950 text-green-700 hover:bg-green-900 transition-all"
                >
                  ✕ СБРОС ЦЕЛИ
                </button>
              </div>
              
              <button
                onClick={clearHistory}
                className="w-full py-2 rounded text-xs border border-green-900 bg-green-950 text-green-700 hover:bg-green-900 transition-all"
              >
                ОЧИСТИТЬ ИСТОРИЮ
              </button>
            </div>
          </div>

          {/* Быстрые данные */}
          {fireSolution && (
            <div className="border border-yellow-900 rounded bg-[#1a1a0d] p-4">
              <h2 className="text-sm font-bold text-yellow-400 mb-2 border-b border-yellow-900 pb-2">
                ⚡ КОМАНДА ОГНЯ
              </h2>
              <div className="text-center space-y-1">
                <div className="text-yellow-300 text-2xl font-bold">
                  {formatAngle(fireSolution.azimuth)}
                </div>
                <div className="text-yellow-500 text-xs">АЗИМУТ</div>
                <div className="text-yellow-300 text-xl font-bold mt-2">
                  {fireSolution.elevation.toFixed(1)}°
                </div>
                <div className="text-yellow-500 text-xs">УГОЛ МЕСТА</div>
                <div className="text-yellow-300 text-lg font-bold mt-2">
                  {fireSolution.distance.toFixed(0)}м
                </div>
                <div className="text-yellow-500 text-xs">ДАЛЬНОСТЬ</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-green-900 bg-[#0d1a0d] px-4 py-2">
        <div className="flex justify-between items-center max-w-7xl mx-auto text-xs text-green-700">
          <span>MTC ARTILLERY FIRE CONTROL SYSTEM</span>
          <span>Калибр: 152мм | Боеприпас: ОФ</span>
          <span>© ART-COMPUTER 2024</span>
        </div>
      </footer>
    </div>
  );
}

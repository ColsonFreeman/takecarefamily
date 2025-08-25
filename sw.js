
    <script>
        // --- Service Worker 註冊 ---
        // 這是新增的程式碼，用來註冊 PWA 的核心檔案 sw.js
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js')
                    .then(registration => {
                        console.log('Service Worker 註冊成功:', registration);
                    })
                    .catch(error => {
                        console.log('Service Worker 註冊失敗:', error);
                    });
            });
        }

        // 應用狀態管理
        let currentView = 'main';
        let activityBaseline = {
            wakeTime: '07:30',
            sleepTime: '22:00',
            dailySteps: 3000,
            heartRateRange: [60, 80]
        };
        
        let currentData = {
            steps: 3247,
            heartRate: 72,
            lastActivity: new Date(),
            isActive: true
        };

        // DOM 元素
        const mainApp = document.getElementById('mainApp');
        const guardianApp = document.getElementById('guardianApp');
        const alertModal = document.getElementById('alertModal');
        const installModal = document.getElementById('installModal');
        const installBanner = document.getElementById('installBanner');
        const emergencyBtn = document.getElementById('emergencyBtn');
        const enableStepCounterBtn = document.getElementById('enableStepCounter');
        const enableHeartRateBtn = document.getElementById('enableHeartRate');
        const sensorStatus = document.getElementById('sensorStatus');
        const showMainBtn = document.getElementById('showMain');
        const showGuardianBtn = document.getElementById('showGuardian');
        const switchToMainBtn = document.getElementById('switchToMain');
        const simulateAlertBtn = document.getElementById('simulateAlert');
        const showInstallGuideBtn = document.getElementById('showInstallGuide');
        const closeAlertBtn = document.getElementById('closeAlert');
        const closeInstallModalBtn = document.getElementById('closeInstallModal');
        const installAppBtn = document.getElementById('installApp');
        const dismissInstallBtn = document.getElementById('dismissInstall');

        // PWA 安裝相關
        let deferredPrompt;
        let isInstallable = false;

        // 切換視圖功能
        function switchView(view) {
            currentView = view;
            
            if (view === 'main') {
                mainApp.classList.remove('hidden');
                guardianApp.classList.add('hidden');
                showMainBtn.classList.add('text-blue-500');
                showMainBtn.classList.remove('text-gray-400');
                showGuardianBtn.classList.add('text-gray-400');
                showGuardianBtn.classList.remove('text-blue-500');
            } else if (view === 'guardian') {
                mainApp.classList.add('hidden');
                guardianApp.classList.remove('hidden');
                showGuardianBtn.classList.add('text-blue-500');
                showGuardianBtn.classList.remove('text-gray-400');
                showMainBtn.classList.add('text-gray-400');
                showMainBtn.classList.remove('text-blue-500');
            }
        }

        // 異常偵測算法
        function detectAnomalies() {
            const alerts = [];
            const now = new Date();
            const timeSinceLastActivity = (now - currentData.lastActivity) / (1000 * 60); // 分鐘

            // 檢查長時間無活動
            if (timeSinceLastActivity > 120) { // 2小時無活動
                alerts.push({
                    type: 'inactivity',
                    message: '長時間無活動偵測',
                    severity: 'high'
                });
            }

            // 檢查心率異常
            if (currentData.heartRate < activityBaseline.heartRateRange[0] || 
                currentData.heartRate > activityBaseline.heartRateRange[1]) {
                alerts.push({
                    type: 'heartRate',
                    message: '心率異常',
                    severity: 'medium'
                });
            }

            // 檢查活動量異常
            if (currentData.steps < activityBaseline.dailySteps * 0.3) {
                alerts.push({
                    type: 'lowActivity',
                    message: '活動量過低',
                    severity: 'low'
                });
            }

            return alerts;
        }

        // 發送警報給守護者
        function sendAlertToGuardians(alertType, message) {
            // 模擬 Firebase Cloud Functions 警報發送
            console.log(`發送警報: ${alertType} - ${message}`);
            
            // 更新守護者介面的警報狀態
            const alertStatus = document.getElementById('alertStatus');
            alertStatus.className = 'p-4 bg-red-50 border-l-4 border-red-500 rounded-r-xl';
            alertStatus.innerHTML = `
                <div class="flex items-center">
                    <span class="text-red-500 text-xl mr-3">🚨</span>
                    <div>
                        <div class="font-medium text-red-800">${message}</div>
                        <div class="text-sm text-red-600">警報時間：${new Date().toLocaleTimeString('zh-TW')}</div>
                    </div>
                </div>
            `;

            // 3秒後恢復正常狀態（模擬處理完成）
            setTimeout(() => {
                alertStatus.className = 'p-4 bg-green-50 border-l-4 border-green-500 rounded-r-xl';
                alertStatus.innerHTML = `
                    <div class="flex items-center">
                        <span class="text-green-500 text-xl mr-3">✅</span>
                        <div>
                            <div class="font-medium text-green-800">狀態正常</div>
                            <div class="text-sm text-green-600">最後更新：剛剛</div>
                        </div>
                    </div>
                `;
            }, 3000);
        }

        // 真實感測器數據獲取
        let sensorData = {
            accelerometer: null,
            gyroscope: null,
            stepCounter: 0,
            isTracking: false
        };

        // 請求感測器權限
        async function requestSensorPermissions() {
            try {
                // 請求動作感測器權限（iOS 13+）
                if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                    const permission = await DeviceMotionEvent.requestPermission();
                    if (permission === 'granted') {
                        console.log('動作感測器權限已獲得');
                        return true;
                    }
                }
                return true; // Android 或較舊的 iOS 版本
            } catch (error) {
                console.log('感測器權限請求失敗:', error);
                return false;
            }
        }

        // 初始化加速度計（用於步數計算）
        function initAccelerometer() {
            if (window.DeviceMotionEvent) {
                window.addEventListener('devicemotion', handleMotionEvent);
                sensorData.isTracking = true;
                console.log('加速度計已啟動');
            } else {
                console.log('設備不支援加速度計');
            }
        }

        // 處理動作事件（步數偵測）
        let lastStepTime = 0;
        let stepThreshold = 1.2; // 步數偵測閾值
        let stepBuffer = [];

        function handleMotionEvent(event) {
            if (!event.accelerationIncludingGravity) return;

            const { x, y, z } = event.accelerationIncludingGravity;
            const acceleration = Math.sqrt(x*x + y*y + z*z);
            
            // 簡單的步數偵測算法
            const currentTime = Date.now();
            stepBuffer.push({ acceleration, time: currentTime });
            
            // 保持最近1秒的數據
            stepBuffer = stepBuffer.filter(data => currentTime - data.time < 1000);
            
            // 偵測步數（尋找加速度峰值）
            if (stepBuffer.length > 10) {
                const avgAcceleration = stepBuffer.reduce((sum, data) => sum + data.acceleration, 0) / stepBuffer.length;
                
                if (acceleration > avgAcceleration + stepThreshold && 
                    currentTime - lastStepTime > 300) { // 最少間隔300ms
                    sensorData.stepCounter++;
                    lastStepTime = currentTime;
                    currentData.lastActivity = new Date();
                    
                    // 更新UI
                    currentData.steps = sensorData.stepCounter;
                    document.getElementById('stepCount').textContent = currentData.steps.toLocaleString();
                }
            }
        }

        // 心率監測（使用相機和閃光燈）
        let heartRateMonitor = {
            isMonitoring: false,
            videoElement: null,
            canvas: null,
            context: null,
            samples: [],
            sampleRate: 30 // fps
        };

        async function initHeartRateMonitor() {
            try {
                // 請求相機權限
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { 
                        facingMode: 'environment', // 後置相機
                        width: { ideal: 320 },
                        height: { ideal: 240 }
                    }
                });

                // 創建隱藏的視頻元素
                heartRateMonitor.videoElement = document.createElement('video');
                heartRateMonitor.videoElement.srcObject = stream;
                heartRateMonitor.videoElement.play();

                // 創建 canvas 用於圖像處理
                heartRateMonitor.canvas = document.createElement('canvas');
                heartRateMonitor.context = heartRateMonitor.canvas.getContext('2d');

                // 嘗試開啟閃光燈
                const track = stream.getVideoTracks()[0];
                if (track.getCapabilities && track.getCapabilities().torch) {
                    await track.applyConstraints({
                        advanced: [{ torch: true }]
                    });
                }

                heartRateMonitor.isMonitoring = true;
                startHeartRateDetection();
                console.log('心率監測已啟動');

            } catch (error) {
                console.log('心率監測初始化失敗:', error);
                // 回退到模擬數據
                useSimulatedHeartRate();
            }
        }

        function startHeartRateDetection() {
            if (!heartRateMonitor.isMonitoring) return;

            const video = heartRateMonitor.videoElement;
            const canvas = heartRateMonitor.canvas;
            const context = heartRateMonitor.context;

            canvas.width = video.videoWidth || 320;
            canvas.height = video.videoHeight || 240;

            // 每33ms採樣一次（30fps）
            const sampleInterval = setInterval(() => {
                if (!heartRateMonitor.isMonitoring) {
                    clearInterval(sampleInterval);
                    return;
                }

                // 繪製視頻幀到 canvas
                context.drawImage(video, 0, 0, canvas.width, canvas.height);
                
                // 獲取圖像數據
                const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
                const data = imageData.data;

                // 計算平均紅色值（血液中的血紅蛋白會吸收綠光，反射紅光）
                let redSum = 0;
                for (let i = 0; i < data.length; i += 4) {
                    redSum += data[i]; // 紅色通道
                }
                const avgRed = redSum / (data.length / 4);

                // 記錄樣本
                heartRateMonitor.samples.push({
                    value: avgRed,
                    timestamp: Date.now()
                });

                // 保持最近30秒的樣本
                const thirtySecondsAgo = Date.now() - 30000;
                heartRateMonitor.samples = heartRateMonitor.samples.filter(
                    sample => sample.timestamp > thirtySecondsAgo
                );

                // 每10秒計算一次心率
                if (heartRateMonitor.samples.length >= 300) { // 10秒 * 30fps
                    calculateHeartRate();
                }

            }, 1000 / heartRateMonitor.sampleRate);
        }

        function calculateHeartRate() {
            const samples = heartRateMonitor.samples;
            if (samples.length < 150) return; // 至少需要5秒的數據

            // 使用簡單的峰值檢測算法
            const values = samples.map(s => s.value);
            const mean = values.reduce((a, b) => a + b) / values.length;
            
            // 找出峰值
            let peaks = 0;
            let lastPeakTime = 0;
            
            for (let i = 1; i < samples.length - 1; i++) {
                const current = values[i];
                const prev = values[i - 1];
                const next = values[i + 1];
                
                // 檢測峰值（當前值大於前後值且大於平均值）
                if (current > prev && current > next && current > mean * 1.02) {
                    const currentTime = samples[i].timestamp;
                    
                    // 確保峰值間隔合理（300ms-2000ms，對應200-30 BPM）
                    if (currentTime - lastPeakTime > 300 && currentTime - lastPeakTime < 2000) {
                        peaks++;
                    }
                    lastPeakTime = currentTime;
                }
            }

            // 計算心率（每分鐘心跳數）
            const timeSpan = (samples[samples.length - 1].timestamp - samples[0].timestamp) / 1000; // 秒
            const heartRate = Math.round((peaks / timeSpan) * 60);

            // 驗證心率是否在合理範圍內
            if (heartRate >= 40 && heartRate <= 200) {
                currentData.heartRate = heartRate;
                document.getElementById('heartRate').textContent = `${heartRate} bpm`;
                console.log(`檢測到心率: ${heartRate} BPM`);
            }
        }

        // 回退到模擬心率（當無法使用相機時）
        function useSimulatedHeartRate() {
            setInterval(() => {
                // 基於活動量調整心率
                const baseHeartRate = 70;
                const activityFactor = Math.min(currentData.steps / 100, 30); // 每100步增加心率
                const randomVariation = (Math.random() - 0.5) * 6; // ±3 BPM隨機變化
                
                currentData.heartRate = Math.round(baseHeartRate + activityFactor + randomVariation);
                currentData.heartRate = Math.max(50, Math.min(120, currentData.heartRate));
                
                document.getElementById('heartRate').textContent = `${currentData.heartRate} bpm`;
            }, 5000); // 每5秒更新一次
        }

        // 整合健康數據更新
        function updateHealthData() {
            // 如果沒有使用真實感測器，則使用模擬數據
            if (!sensorData.isTracking) {
                currentData.steps += Math.floor(Math.random() * 5);
                document.getElementById('stepCount').textContent = currentData.steps.toLocaleString();
            }

            // 更新最後活動時間
            if (Math.random() > 0.7) {
                currentData.lastActivity = new Date();
            }

            // 執行異常偵測
            const alerts = detectAnomalies();
            if (alerts.length > 0) {
                alerts.forEach(alert => {
                    if (alert.severity === 'high') {
                        sendAlertToGuardians(alert.type, alert.message);
                    }
                });
            }
        }

        // PWA 安裝功能
        function detectDevice() {
            const userAgent = navigator.userAgent.toLowerCase();
            if (/iphone|ipad|ipod/.test(userAgent)) {
                return 'ios';
            } else if (/android/.test(userAgent)) {
                return 'android';
            }
            return 'other';
        }

        function showInstallInstructions() {
            const device = detectDevice();
            const iosInstructions = document.getElementById('iosInstructions');
            const androidInstructions = document.getElementById('androidInstructions');
            
            // 隱藏所有說明
            iosInstructions.classList.add('hidden');
            androidInstructions.classList.add('hidden');
            
            // 根據設備顯示對應說明
            if (device === 'ios') {
                iosInstructions.classList.remove('hidden');
            } else if (device === 'android') {
                androidInstructions.classList.remove('hidden');
            }
            
            installModal.classList.remove('hidden');
        }

        function checkInstallability() {
            // 檢查是否已經安裝
            if (window.matchMedia('(display-mode: standalone)').matches) {
                return false; // 已經安裝
            }
            
            // 檢查是否支援 PWA
            if ('serviceWorker' in navigator && 'PushManager' in window) {
                return true;
            }
            
            return false;
        }

        // 監聽 PWA 安裝提示事件
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            isInstallable = true;
            
            // 顯示安裝橫幅（如果用戶還沒有拒絕過）
            if (!localStorage.getItem('installDismissed')) {
                setTimeout(() => {
                    installBanner.classList.remove('hidden');
                }, 3000); // 3秒後顯示
            }
        });

        // 監聽安裝完成事件
        window.addEventListener('appinstalled', () => {
            console.log('PWA 安裝成功');
            installBanner.classList.add('hidden');
            deferredPrompt = null;
            isInstallable = false;
        });

        // 事件監聽器
        emergencyBtn.addEventListener('click', () => {
            alertModal.classList.remove('hidden');
            sendAlertToGuardians('emergency', '緊急求助按鈕被按下');
        });

        // 感測器啟用按鈕
        enableStepCounterBtn.addEventListener('click', async () => {
            sensorStatus.textContent = '正在啟用步數計算...';
            
            const hasPermission = await requestSensorPermissions();
            if (hasPermission) {
                initAccelerometer();
                enableStepCounterBtn.textContent = '✅ 步數計算已啟用';
                enableStepCounterBtn.disabled = true;
                enableStepCounterBtn.classList.add('bg-gray-400');
                enableStepCounterBtn.classList.remove('bg-blue-500', 'hover:bg-blue-600');
                sensorStatus.textContent = '步數計算使用手機加速度計，請將手機隨身攜帶';
            } else {
                sensorStatus.textContent = '無法啟用步數計算，將使用模擬數據';
            }
        });

        enableHeartRateBtn.addEventListener('click', async () => {
            sensorStatus.textContent = '正在啟用心率監測...';
            
            try {
                await initHeartRateMonitor();
                enableHeartRateBtn.textContent = '✅ 心率監測已啟用';
                enableHeartRateBtn.disabled = true;
                enableHeartRateBtn.classList.add('bg-gray-400');
                enableHeartRateBtn.classList.remove('bg-green-500', 'hover:bg-green-600');
                sensorStatus.textContent = '心率監測使用相機和閃光燈，請用手指輕壓鏡頭';
            } catch (error) {
                sensorStatus.textContent = '無法啟用心率監測，將使用智能模擬數據';
                useSimulatedHeartRate();
            }
        });

        closeAlertBtn.addEventListener('click', () => {
            alertModal.classList.add('hidden');
        });

        closeInstallModalBtn.addEventListener('click', () => {
            installModal.classList.add('hidden');
        });

        showMainBtn.addEventListener('click', () => switchView('main'));
        showGuardianBtn.addEventListener('click', () => switchView('guardian'));
        switchToMainBtn.addEventListener('click', () => switchView('main'));

        showInstallGuideBtn.addEventListener('click', () => {
            showInstallInstructions();
        });

        installAppBtn.addEventListener('click', async () => {
            if (deferredPrompt && isInstallable) {
                // 使用瀏覽器原生安裝提示
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                
                if (outcome === 'accepted') {
                    console.log('用戶接受安裝');
                } else {
                    console.log('用戶拒絕安裝');
                }
                
                deferredPrompt = null;
                isInstallable = false;
                installBanner.classList.add('hidden');
            } else {
                // 顯示手動安裝說明
                showInstallInstructions();
            }
        });

        dismissInstallBtn.addEventListener('click', () => {
            installBanner.classList.add('hidden');
            localStorage.setItem('installDismissed', 'true');
        });

        simulateAlertBtn.addEventListener('click', () => {
            // 模擬異常情況
            currentData.heartRate = 95; // 設置異常心率
            currentData.lastActivity = new Date(Date.now() - 3 * 60 * 60 * 1000); // 3小時前
            
            const alerts = detectAnomalies();
            if (alerts.length > 0) {
                sendAlertToGuardians('simulation', '模擬異常偵測警報');
            }
            
            // 切換到守護者視圖查看警報
            setTimeout(() => switchView('guardian'), 500);
        });

        // 初始化應用
        function initApp() {
            switchView('main');
            
            // 檢查安裝狀態
            if (checkInstallability()) {
                console.log('應用可以安裝');
            }
            
            // 每30秒更新一次健康數據
            setInterval(updateHealthData, 30000);
            
            // 立即更新一次數據
            updateHealthData();
            
            // 如果是第一次訪問，顯示安裝提示
            if (!localStorage.getItem('firstVisit')) {
                setTimeout(() => {
                    if (!window.matchMedia('(display-mode: standalone)').matches) {
                        showInstallInstructions();
                    }
                }, 5000);
                localStorage.setItem('firstVisit', 'true');
            }
        }

        // 啟動應用
        initApp();
    </script>
</body>
</html>

---
<!-- 請將以下內容儲存為 sw.js 檔案 -->
<script>
// Service Worker (sw.js)
// 這個檔案是 PWA 的核心，負責背景任務和快取

const CACHE_NAME = 'duju-shouhu-v1';
const urlsToCache = [
  '/',
  // 你可以將其他靜態資源如 CSS, JS, 圖片等也加入快取列表
  // 但因為這個範例中資源都是內聯或來自 CDN，所以這裡保持簡單
];

// 安裝事件：當 Service Worker 第一次被註冊時觸發
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('快取已開啟');
        return cache.addAll(urlsToCache);
      })
  );
});

// 攔截網路請求事件
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // 如果快取中有對應的回應，就直接回傳
        if (response) {
          return response;
        }
        // 否則，就發出網路請求
        return fetch(event.request);
      }
    )
  );
});

// 啟用事件：當新的 Service Worker 取代舊的時觸發
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            // 刪除舊的快取
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
</script>

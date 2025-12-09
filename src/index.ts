// Durable Object for global counter with WebSocket support
export class Counter {
	private state: DurableObjectState;
	private env: Env;

	constructor(state: DurableObjectState, env: Env) {
		this.state = state;
		this.env = env;
	}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);

		// WebSocket upgrade request
		if (request.headers.get('Upgrade') === 'websocket') {
			const pair = new WebSocketPair();
			const [client, server] = Object.values(pair);

			// Accept WebSocket connection with hibernation support
			this.state.acceptWebSocket(server);

			// Send current count immediately after connection
			const count = (await this.state.storage.get<number>('count')) || 0;
			server.send(JSON.stringify({ type: 'count', value: count }));

			return new Response(null, {
				status: 101,
				webSocket: client,
			});
		}

		// HTTP API for counter operations
		if (url.pathname === '/increment') {
			const count = ((await this.state.storage.get<number>('count')) || 0) + 1;
			await this.state.storage.put('count', count);

			// Broadcast to all connected clients
			this.broadcast({ type: 'count', value: count });

			return Response.json({ count });
		}

		if (url.pathname === '/count') {
			const count = (await this.state.storage.get<number>('count')) || 0;
			return Response.json({ count });
		}

		return new Response('Not found', { status: 404 });
	}

	// Handle WebSocket messages (Hibernation API)
	async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
		try {
			const data = typeof message === 'string' ? JSON.parse(message) : null;

			if (data?.type === 'increment') {
				const count = ((await this.state.storage.get<number>('count')) || 0) + 1;
				await this.state.storage.put('count', count);

				// Broadcast to all connected clients
				this.broadcast({ type: 'count', value: count });
			}
		} catch (error) {
			console.error('WebSocket message error:', error);
		}
	}

	// Handle WebSocket close (Hibernation API)
	async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
		// Cleanup if needed
		ws.close(code, 'Durable Object is closing WebSocket');
	}

	// Handle WebSocket error (Hibernation API)
	async webSocketError(ws: WebSocket, error: unknown) {
		console.error('WebSocket error:', error);
	}

	// Broadcast message to all connected clients
	private broadcast(message: any) {
		const messageStr = JSON.stringify(message);
		const webSockets = this.state.getWebSockets();

		for (const ws of webSockets) {
			try {
				ws.send(messageStr);
			} catch (error) {
				console.error('Broadcast error:', error);
			}
		}
	}
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url);

		// Route to Durable Object for /ws and /api paths
		if (url.pathname === '/ws' || url.pathname.startsWith('/api/')) {
			const id = env.COUNTER.idFromName('global-counter');
			const stub = env.COUNTER.get(id);

			// Rewrite path for Durable Object
			const doUrl = new URL(request.url);
			if (url.pathname === '/ws') {
				// WebSocket connection
				return stub.fetch(request);
			} else if (url.pathname === '/api/increment') {
				doUrl.pathname = '/increment';
				return stub.fetch(new Request(doUrl, request));
			} else if (url.pathname === '/api/count') {
				doUrl.pathname = '/count';
				return stub.fetch(new Request(doUrl, request));
			}
		}

		if (url.pathname === '/') {
			return new Response(getHTML(), {
				headers: {
					'Content-Type': 'text/html;charset=UTF-8',
				},
			});
		}

		return env.ASSETS.fetch(request);
	},
} satisfies ExportedHandler<Env>;

function getHTML(): string {
	return `<!DOCTYPE html>
<html lang="ja">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>🌟 猫ボタンカウンター 🌟</title>
	<style>
		* {
			margin: 0;
			padding: 0;
			box-sizing: border-box;
		}

		body {
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			min-height: 100vh;
			overflow: hidden;
			position: relative;
			background: #000;
		}

		.background-container {
			position: fixed;
			top: 0;
			left: 0;
			width: 100%;
			height: 100%;
			z-index: 0;
			overflow: hidden;
		}

		.rainbow-stripes {
			position: absolute;
			width: 200%;
			height: 200%;
			background: repeating-linear-gradient(
				45deg,
				#ff0080 0px,
				#ff0080 50px,
				#ff8c00 50px,
				#ff8c00 100px,
				#ffd700 100px,
				#ffd700 150px,
				#00ff00 150px,
				#00ff00 200px,
				#00bfff 200px,
				#00bfff 250px,
				#8b00ff 250px,
				#8b00ff 300px
			);
			animation: rotate-bg 20s linear infinite;
			opacity: 0.8;
		}

		.stars {
			position: absolute;
			width: 100%;
			height: 100%;
			background-image:
				radial-gradient(2px 2px at 20% 30%, white, transparent),
				radial-gradient(2px 2px at 60% 70%, white, transparent),
				radial-gradient(3px 3px at 50% 50%, white, transparent),
				radial-gradient(2px 2px at 80% 10%, white, transparent),
				radial-gradient(2px 2px at 90% 60%, white, transparent),
				radial-gradient(1px 1px at 30% 80%, white, transparent),
				radial-gradient(2px 2px at 10% 90%, white, transparent);
			background-size: 200% 200%;
			animation: twinkle 3s ease-in-out infinite;
		}

		@keyframes rotate-bg {
			0% { transform: rotate(0deg); }
			100% { transform: rotate(360deg); }
		}

		@keyframes twinkle {
			0%, 100% { opacity: 1; }
			50% { opacity: 0.5; }
		}

		.container {
			position: relative;
			z-index: 1;
			background: rgba(255, 255, 255, 0.95);
			padding: 20px;
			border-radius: 30px;
			box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5), 0 0 50px rgba(255, 255, 255, 0.3);
			text-align: center;
			max-width: 95vw;
			backdrop-filter: blur(10px);
			border: 5px solid transparent;
			background-clip: padding-box;
			animation: rainbow-border 3s linear infinite;
		}

		@keyframes rainbow-border {
			0% { filter: hue-rotate(0deg); }
			100% { filter: hue-rotate(360deg); }
		}

		h1 {
			color: #ff1493;
			margin-bottom: 20px;
			font-size: clamp(24px, 5vw, 48px);
			text-shadow: 2px 2px 4px rgba(0,0,0,0.3),
						 0 0 20px rgba(255,20,147,0.5);
			animation: pulse-title 2s ease-in-out infinite;
		}

		@keyframes pulse-title {
			0%, 100% { transform: scale(1); }
			50% { transform: scale(1.05); }
		}

		.counter {
			font-size: clamp(60px, 15vw, 120px);
			font-weight: bold;
			background: linear-gradient(45deg, #ff0080, #ff8c00, #ffd700, #00ff00, #00bfff, #8b00ff);
			background-size: 200% 200%;
			-webkit-background-clip: text;
			background-clip: text;
			-webkit-text-fill-color: transparent;
			margin: 20px 0;
			animation: rainbow-text 3s ease infinite;
			text-shadow: 0 0 30px rgba(255,255,255,0.5);
		}

		@keyframes rainbow-text {
			0% { background-position: 0% 50%; }
			50% { background-position: 100% 50%; }
			100% { background-position: 0% 50%; }
		}

		.button-wrapper {
			position: relative;
			display: inline-block;
			margin: 20px 0;
		}

		.neko-button {
			cursor: pointer;
			transition: transform 0.1s ease;
			border: none;
			background: none;
			padding: 0;
			border-radius: 50%;
			box-shadow: 0 10px 30px rgba(255, 20, 147, 0.5),
						0 0 50px rgba(255, 215, 0, 0.3);
			position: relative;
			animation: float 3s ease-in-out infinite;
		}

		@keyframes float {
			0%, 100% { transform: translateY(0px); }
			50% { transform: translateY(-20px); }
		}

		.neko-button:hover {
			transform: scale(1.1) rotate(5deg);
		}

		.neko-button:active {
			transform: scale(0.95) rotate(-5deg);
		}

		.neko-button img {
			width: clamp(250px, 50vw, 500px);
			height: clamp(250px, 50vw, 500px);
			display: block;
			border-radius: 50%;
			object-fit: cover;
		}

		.message {
			margin-top: 20px;
			font-size: clamp(20px, 4vw, 32px);
			color: #ff1493;
			min-height: 40px;
			font-weight: bold;
			text-shadow: 2px 2px 4px rgba(0,0,0,0.2);
		}

		.sparkle {
			position: fixed;
			pointer-events: none;
			z-index: 9999;
		}

		.sparkle::before,
		.sparkle::after {
			content: '✨';
			position: absolute;
			font-size: 30px;
			animation: sparkle-animation 1s ease-out forwards;
		}

		.sparkle::after {
			content: '⭐';
			animation-delay: 0.1s;
		}

		@keyframes sparkle-animation {
			0% {
				opacity: 1;
				transform: translate(0, 0) scale(0) rotate(0deg);
			}
			100% {
				opacity: 0;
				transform: translate(var(--tx), var(--ty)) scale(1.5) rotate(360deg);
			}
		}

		@keyframes bounce {
			0%, 100% { transform: scale(1); }
			25% { transform: scale(1.2) rotate(-10deg); }
			75% { transform: scale(1.2) rotate(10deg); }
		}

		@media (max-width: 600px) {
			.container {
				padding: 15px;
			}
		}
	</style>
</head>
<body>
	<div class="background-container">
		<div class="rainbow-stripes"></div>
		<div class="stars"></div>
	</div>

	<div class="container">
		<h1>🐱✨ 猫ボタンカウンター ✨🐱</h1>
		<div class="counter" id="counter">0</div>
		<div class="button-wrapper">
			<button class="neko-button" id="nekoButton">
				<img src="/nekobutton.png" alt="猫ボタン">
			</button>
		</div>
		<div class="message" id="message">猫ボタンをクリックしてね！</div>
	</div>

	<script>
		let count = 0;
		const counterElement = document.getElementById('counter');
		const messageElement = document.getElementById('message');
		const nekoButton = document.getElementById('nekoButton');
		let ws = null;
		let reconnectTimeout = null;

		const messages = [
			'にゃー！✨',
			'かわいい！🌟',
			'もっと押して！💫',
			'猫は気まぐれ😺',
			'ゴロゴロ〜🎵',
			'なでなで💕',
			'おやつちょうだい🐟',
			'キラキラ〜✨',
			'すごい！🎉',
			'やったね！🎊',
		];

		// Connect to WebSocket
		function connectWebSocket() {
			const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
			const wsUrl = \`\${protocol}//\${window.location.host}/ws\`;

			ws = new WebSocket(wsUrl);

			ws.onopen = () => {
				console.log('WebSocket connected');
				messageElement.textContent = '🌐 世界中とつながっています！';
				if (reconnectTimeout) {
					clearTimeout(reconnectTimeout);
					reconnectTimeout = null;
				}
			};

			ws.onmessage = (event) => {
				try {
					const data = JSON.parse(event.data);
					if (data.type === 'count') {
						count = data.value;
						updateCounter();
					}
				} catch (error) {
					console.error('WebSocket message error:', error);
				}
			};

			ws.onclose = () => {
				console.log('WebSocket disconnected');
				messageElement.textContent = '接続が切れました... 再接続中';
				// Reconnect after 2 seconds
				reconnectTimeout = setTimeout(connectWebSocket, 2000);
			};

			ws.onerror = (error) => {
				console.error('WebSocket error:', error);
			};
		}

		function updateCounter() {
			counterElement.textContent = count;
			counterElement.style.animation = 'none';
			setTimeout(() => {
				counterElement.style.animation = 'bounce 0.5s ease';
			}, 10);
		}

		function createSparkles(x, y) {
			const sparkleCount = 8;
			for (let i = 0; i < sparkleCount; i++) {
				const sparkle = document.createElement('div');
				sparkle.className = 'sparkle';
				sparkle.style.left = x + 'px';
				sparkle.style.top = y + 'px';

				const angle = (Math.PI * 2 * i) / sparkleCount;
				const distance = 100 + Math.random() * 100;
				const tx = Math.cos(angle) * distance;
				const ty = Math.sin(angle) * distance;

				sparkle.style.setProperty('--tx', tx + 'px');
				sparkle.style.setProperty('--ty', ty + 'px');

				document.body.appendChild(sparkle);

				setTimeout(() => sparkle.remove(), 1000);
			}

			for (let i = 0; i < 5; i++) {
				const star = document.createElement('div');
				star.textContent = ['⭐', '✨', '💫', '🌟'][Math.floor(Math.random() * 4)];
				star.style.position = 'fixed';
				star.style.left = x + (Math.random() - 0.5) * 100 + 'px';
				star.style.top = y + (Math.random() - 0.5) * 100 + 'px';
				star.style.fontSize = (20 + Math.random() * 30) + 'px';
				star.style.pointerEvents = 'none';
				star.style.zIndex = '9999';
				star.style.animation = 'sparkle-animation 1.5s ease-out forwards';
				star.style.setProperty('--tx', (Math.random() - 0.5) * 200 + 'px');
				star.style.setProperty('--ty', -150 - Math.random() * 100 + 'px');

				document.body.appendChild(star);
				setTimeout(() => star.remove(), 1500);
			}
		}

		nekoButton.addEventListener('click', (e) => {
			// Send increment through WebSocket
			if (ws && ws.readyState === WebSocket.OPEN) {
				ws.send(JSON.stringify({ type: 'increment' }));

				const randomMessage = messages[Math.floor(Math.random() * messages.length)];
				messageElement.textContent = randomMessage;

				const rect = nekoButton.getBoundingClientRect();
				const x = rect.left + rect.width / 2;
				const y = rect.top + rect.height / 2;
				createSparkles(x, y);
			} else {
				messageElement.textContent = '接続を確立中... 少し待ってね！';
			}
		});

		// Initialize WebSocket connection
		connectWebSocket();
	</script>
</body>
</html>`;
}

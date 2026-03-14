const http = require('http');
const EventSource = require('eventsource');

// Demo MCP Server usage
class McpDemo {
    constructor() {
        this.baseUrl = 'http://localhost:3000';
        this.mcpUrl = 'http://localhost:3001';
    }

    async makeRequest(path, method = 'GET', data = null) {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'localhost',
                port: path.includes('3001') ? 3001 : 3000,
                path: path.replace(/^http:\/\/localhost:\d+/, ''),
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                }
            };

            if (data) {
                const postData = JSON.stringify(data);
                options.headers['Content-Length'] = Buffer.byteLength(postData);
            }

            const req = http.request(options, (res) => {
                let body = '';
                res.on('data', (chunk) => {
                    body += chunk;
                });
                res.on('end', () => {
                    try {
                        const result = JSON.parse(body);
                        resolve({ status: res.statusCode, data: result });
                    } catch (e) {
                        resolve({ status: res.statusCode, data: body });
                    }
                });
            });

            req.on('error', (err) => {
                reject(err);
            });

            if (data) {
                req.write(JSON.stringify(data));
            }
            req.end();
        });
    }

    async demoServerInfo() {
        console.log('\n🔍 Demo 1: Server Information');
        console.log('='.repeat(50));
        
        const info = await this.makeRequest(`${this.baseUrl}/mcp/info`);
        console.log('Server Info:', JSON.stringify(info.data, null, 2));
    }

    async demoTools() {
        console.log('\n🛠️  Demo 2: Available Tools');
        console.log('='.repeat(50));
        
        const tools = await this.makeRequest(`${this.baseUrl}/mcp/tools`);
        console.log('Available Tools:', JSON.stringify(tools.data, null, 2));
    }

    async demoResources() {
        console.log('\n📁 Demo 3: Available Resources');
        console.log('='.repeat(50));
        
        const resources = await this.makeRequest(`${this.baseUrl}/mcp/resources`);
        console.log('Available Resources:', JSON.stringify(resources.data, null, 2));
    }

    async demoMcpRequest() {
        console.log('\n📡 Demo 4: MCP Protocol Request');
        console.log('='.repeat(50));
        
        // Example MCP request to list tools
        const mcpRequest = {
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/list',
            params: {}
        };
        
        console.log('Sending MCP request:', JSON.stringify(mcpRequest, null, 2));
        const response = await this.makeRequest(`${this.baseUrl}/mcp`, 'POST', mcpRequest);
        console.log('MCP Response:', JSON.stringify(response.data, null, 2));
    }

    demoStream() {
        console.log('\n🌊 Demo 5: HTTP Stream (Server-Sent Events)');
        console.log('='.repeat(50));
        
        const eventSource = new EventSource(`${this.baseUrl}/mcp/stream`);
        
        eventSource.onopen = () => {
            console.log('✅ Stream connected');
        };
        
        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('📨 Stream message:', data);
            } catch (e) {
                console.log('📨 Raw stream data:', event.data);
            }
        };
        
        eventSource.onerror = (error) => {
            console.error('❌ Stream error:', error);
            eventSource.close();
        };
        
        // Close stream after 10 seconds
        setTimeout(() => {
            console.log('🔒 Closing stream connection...');
            eventSource.close();
        }, 10000);
    }

    async runAllDemos() {
        console.log('🚀 PHO MCP Server Demo');
        console.log('='.repeat(50));
        
        try {
            // Check if server is running
            const status = await this.makeRequest(`${this.baseUrl}/mcp/status`);
            if (status.status !== 200) {
                throw new Error('Server is not running');
            }
            
            console.log('✅ Server is running');
            
            // Run demos
            await this.demoServerInfo();
            await this.demoTools();
            await this.demoResources();
            await this.demoMcpRequest();
            this.demoStream();
            
            console.log('\n🎉 All demos completed!');
            console.log('\n📚 Next steps:');
            console.log('1. Check the MCP_README.md for detailed documentation');
            console.log('2. Use the test script: npm run test:mcp');
            console.log('3. Explore the API endpoints in your browser');
            console.log('4. Integrate with MCP clients');
            
        } catch (error) {
            console.error('❌ Demo failed:', error.message);
            console.log('\n🔧 Make sure to:');
            console.log('1. Start the server: npm run dev');
            console.log('2. Check if ports 3000 and 3001 are available');
            console.log('3. Verify your .env configuration');
        }
    }
}

// Run demo
const demo = new McpDemo();
demo.runAllDemos(); 
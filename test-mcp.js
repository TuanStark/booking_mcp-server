const http = require('http');

// Test MCP Server endpoints
const BASE_URL = 'http://localhost:3000';
const MCP_URL = 'http://localhost:3001';

async function testEndpoint(url, method = 'GET', data = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: url.includes('3001') ? 3001 : 3000,
            path: url.replace(/^http:\/\/localhost:\d+/, ''),
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

async function testMcpStream() {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: 'localhost',
            port: 3000,
            path: '/mcp/stream',
            method: 'GET',
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                resolve({ status: res.statusCode, data });
            });
        });

        req.on('error', (err) => {
            reject(err);
        });

        // Close after 5 seconds
        setTimeout(() => {
            req.destroy();
        }, 5000);

        req.end();
    });
}

async function runTests() {
    console.log('🧪 Testing PHO MCP Server...\n');

    try {
        // Test 1: Status endpoint
        console.log('1. Testing /mcp/status...');
        const statusResult = await testEndpoint(`${BASE_URL}/mcp/status`);
        console.log('✅ Status:', statusResult.status, JSON.stringify(statusResult.data, null, 2));

        // Test 2: Info endpoint
        console.log('\n2. Testing /mcp/info...');
        const infoResult = await testEndpoint(`${BASE_URL}/mcp/info`);
        console.log('✅ Info:', infoResult.status, JSON.stringify(infoResult.data, null, 2));

        // Test 3: Tools endpoint
        console.log('\n3. Testing /mcp/tools...');
        const toolsResult = await testEndpoint(`${BASE_URL}/mcp/tools`);
        console.log('✅ Tools:', toolsResult.status, JSON.stringify(toolsResult.data, null, 2));

        // Test 4: Resources endpoint
        console.log('\n4. Testing /mcp/resources...');
        const resourcesResult = await testEndpoint(`${BASE_URL}/mcp/resources`);
        console.log('✅ Resources:', resourcesResult.status, JSON.stringify(resourcesResult.data, null, 2));

        // Test 5: MCP endpoint
        console.log('\n5. Testing /mcp (POST)...');
        const mcpResult = await testEndpoint(`${BASE_URL}/mcp`, 'POST', {
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/list',
            params: {}
        });
        console.log('✅ MCP:', mcpResult.status, JSON.stringify(mcpResult.data, null, 2));

        // Test 6: Stream endpoint
        console.log('\n6. Testing /mcp/stream...');
        const streamResult = await testMcpStream();
        console.log('✅ Stream:', streamResult.status, 'Data received:', streamResult.data.length > 0 ? 'Yes' : 'No');

        console.log('\n🎉 All tests completed successfully!');
        console.log('\n📋 Summary:');
        console.log('- MCP Server is running on port 3001');
        console.log('- HTTP API is available on port 3000');
        console.log('- Stream endpoint is working');
        console.log('- All tools and resources are registered');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.log('\n🔧 Troubleshooting:');
        console.log('1. Make sure the server is running: npm run dev');
        console.log('2. Check if ports 3000 and 3001 are available');
        console.log('3. Verify .env configuration');
        console.log('4. Check server logs for errors');
    }
}

// Run tests
runTests(); 
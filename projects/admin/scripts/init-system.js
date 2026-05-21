#!/usr/bin/env node

/**
 * 系统初始化脚本
 * 在服务启动后调用此脚本进行初始化
 */

const http = require('http');

const HOST = process.env.HOST || 'localhost';
const PORT = process.env.PORT || 3000;
const INIT_TOKEN = process.env.INIT_TOKEN || 'your-secret-token';
const MAX_RETRIES = 30; // 最多重试 30 次
const RETRY_INTERVAL = 2000; // 每次重试间隔 2 秒

/**
 * 等待服务启动
 */
async function waitForServer(retries = 0) {
    return new Promise((resolve, reject) => {
        const req = http.request(
            {
                hostname: HOST,
                port: PORT,
                path: '/api/health',
                method: 'GET',
                timeout: 2000
            },
            (res) => {
                if (res.statusCode === 200 || res.statusCode === 404) {
                    console.log('✓ 服务已启动');
                    resolve();
                } else {
                    reject(new Error(`服务返回状态码: ${res.statusCode}`));
                }
            }
        );

        req.on('error', (error) => {
            if (retries < MAX_RETRIES) {
                console.log(`等待服务启动... (${retries + 1}/${MAX_RETRIES})`);
                setTimeout(() => {
                    waitForServer(retries + 1).then(resolve).catch(reject);
                }, RETRY_INTERVAL);
            } else {
                reject(new Error('服务启动超时'));
            }
        });

        req.on('timeout', () => {
            req.destroy();
            if (retries < MAX_RETRIES) {
                console.log(`等待服务启动... (${retries + 1}/${MAX_RETRIES})`);
                setTimeout(() => {
                    waitForServer(retries + 1).then(resolve).catch(reject);
                }, RETRY_INTERVAL);
            } else {
                reject(new Error('服务启动超时'));
            }
        });

        req.end();
    });
}

/**
 * 调用初始化 API
 */
async function initializeSystem() {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify({});

        const req = http.request(
            {
                hostname: HOST,
                port: PORT,
                path: '/api/system/init',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData),
                    Authorization: `Bearer ${INIT_TOKEN}`
                },
                timeout: 60000 // 60 秒超时
            },
            (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    if (res.statusCode === 200) {
                        try {
                            const result = JSON.parse(data);
                            console.log('✓ 系统初始化成功:', result.message);
                            resolve(result);
                        } catch (error) {
                            console.log('✓ 系统初始化成功');
                            resolve();
                        }
                    } else {
                        try {
                            const error = JSON.parse(data);
                            reject(new Error(`初始化失败: ${error.error || data}`));
                        } catch {
                            reject(new Error(`初始化失败，状态码: ${res.statusCode}`));
                        }
                    }
                });
            }
        );

        req.on('error', (error) => {
            reject(new Error(`请求失败: ${error.message}`));
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('初始化请求超时'));
        });

        req.write(postData);
        req.end();
    });
}

/**
 * 主函数
 */
async function main() {
    console.log('开始系统初始化流程...');
    console.log(`目标服务: http://${HOST}:${PORT}`);

    try {
        // 1. 等待服务启动
        console.log('\n1. 等待服务启动...');
        await waitForServer();

        // 2. 调用初始化 API
        console.log('\n2. 执行系统初始化...');
        await initializeSystem();

        console.log('\n✓ 所有初始化步骤完成');
        process.exit(0);
    } catch (error) {
        console.error('\n✗ 初始化失败:', error.message);
        process.exit(1);
    }
}

// 执行主函数
main();

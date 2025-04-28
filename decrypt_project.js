/**
 * 项目解密工具
 * 使用AES解密算法将加密后的项目恢复原状
 */

// 导入所需模块
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const readlineSync = require('readline-sync');

// 创建命令行交互对象
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// 监听SIGINT优雅退出
process.on('SIGINT', () => {
    console.log('\nOperation cancelled.');
    process.exit(0);
});

// 解密文件内容
function decryptContent(encryptedContentHex, iv, password) {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(password, 'salt', 32);
    const decipher = crypto.createDecipheriv(algorithm, key, Buffer.from(iv, 'hex'));

    const encryptedBuffer = Buffer.from(encryptedContentHex, 'hex');
    const decrypted = Buffer.concat([decipher.update(encryptedBuffer), decipher.final()]);

    return decrypted;
}

// 解密文件名
function decryptFileName(encryptedFileName, iv, password) {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(password, 'salt', 32);
    const decipher = crypto.createDecipheriv(algorithm, key, Buffer.from(iv, 'hex'));

    let decrypted = decipher.update(encryptedFileName, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
}

// 应用解密
function applyDecryption(fileMap, basePath, password) {
    // 按照路径深度排序，确保先处理浅层目录
    const sortedPaths = Object.keys(fileMap).sort((a, b) => {
        return a.split(path.sep).length - b.split(path.sep).length;
    });

    // 第一步：恢复所有目录名
    for (const itemPath of sortedPaths) {
        const info = fileMap[itemPath];

        if (info.type === 'directory') {
            const dirParts = itemPath.split(path.sep);
            const parentDir = dirParts.slice(0, -1).join(path.sep);
            const currentDir = path.basename(itemPath);

            const parentFullPath = parentDir ? path.join(basePath, parentDir) : basePath;
            const encryptedPath = path.join(parentFullPath, info.encryptedName);
            const originalPath = path.join(parentFullPath, currentDir);

            if (fs.existsSync(encryptedPath)) {
                fs.renameSync(encryptedPath, originalPath);
                console.log(`Restored directory: ${info.encryptedName} -> ${currentDir}`);
            }
        }
    }

    // 第二步：恢复所有文件名和内容
    for (const itemPath of sortedPaths) {
        const info = fileMap[itemPath];

        if (info.type === 'file') {
            const dirName = path.dirname(itemPath);
            const fileName = path.basename(itemPath);
            const fullDirPath = dirName === '.' ? basePath : path.join(basePath, dirName);

            const encryptedPath = path.join(fullDirPath, info.encryptedName);
            const originalPath = path.join(fullDirPath, fileName);

            if (fs.existsSync(encryptedPath)) {
                try {
                    // 解密文件内容
                    const decryptedContent = decryptContent(info.encryptedContent, info.contentIv, password);

                    // 写入解密后的内容
                    fs.writeFileSync(encryptedPath, decryptedContent);

                    // 恢复文件名
                    fs.renameSync(encryptedPath, originalPath);

                    console.log(`Restored file: ${info.encryptedName} -> ${fileName}`);
                } catch (error) {
                    console.error(`Error decrypting file ${itemPath}:`, error.message);
                }
            } else {
                console.warn(`Warning: Encrypted file not found ${encryptedPath}`);
            }
        }
    }
}

// 主函数
async function main() {
    if (!fs.existsSync('encrypted_files.json')) {
        console.error('Error: encrypted_files.json not found.');
        return;
    }

    let password = '';
    while (true) {
        password = readlineSync.question('Enter decryption password (type exit to cancel, clear to re-enter): ', {hideEchoBack: true});
        if (password.toLowerCase() === 'exit') {
            console.log('Decryption cancelled.');
            process.exit(0);
        }
        if (password.toLowerCase() === 'clear') {
            continue;
        }
        if (!password) {
            console.error('Error: Password cannot be empty.');
            continue;
        }
        break;
    }

    try {
        const basePath = process.cwd();
        const fileMapJson = fs.readFileSync('encrypted_files.json', 'utf8');
        const fileMap = JSON.parse(fileMapJson);

        console.log('Decrypting files...');
        applyDecryption(fileMap, basePath, password);
        console.log('Decryption complete!');

        const answer = readlineSync.question('Delete encrypted_files.json? (y/n): ');
        if (answer.toLowerCase() === 'y') {
            fs.unlinkSync('encrypted_files.json');
            console.log('Mapping file deleted.');
        }
    } catch (error) {
        console.error('Error during decryption:', error);
    }
}

// 运行主函数
main();
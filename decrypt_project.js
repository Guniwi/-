/**
 * 项目解密工具
 * 使用AES解密算法将加密后的项目恢复原状
 */

// 导入所需模块
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// 创建命令行交互对象
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
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
                console.log(`已恢复目录名: ${info.encryptedName} -> ${currentDir}`);
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

                    console.log(`已解密文件: ${info.encryptedName} -> ${fileName}`);
                } catch (error) {
                    console.error(`解密文件时出错 ${itemPath}:`, error.message);
                }
            } else {
                console.warn(`警告: 找不到加密文件 ${encryptedPath}`);
            }
        }
    }
}

// 主函数
async function main() {
    if (!fs.existsSync('encrypted_files.json')) {
        console.error('错误: 找不到加密映射文件 encrypted_files.json');
        rl.close();
        return;
    }

    rl.question('请输入解密密码: ', (password) => {
        if (!password) {
            console.error('错误: 密码不能为空');
            rl.close();
            return;
        }

        try {
            const basePath = process.cwd();
            const fileMapJson = fs.readFileSync('encrypted_files.json', 'utf8');
            const fileMap = JSON.parse(fileMapJson);

            console.log('开始解密文件...');
            applyDecryption(fileMap, basePath, password);
            console.log('解密完成!');

            // 询问是否删除加密映射文件
            rl.question('是否删除加密映射文件 encrypted_files.json? (y/n): ', (answer) => {
                if (answer.toLowerCase() === 'y') {
                    fs.unlinkSync('encrypted_files.json');
                    console.log('已删除加密映射文件');
                }
                rl.close();
            });
        } catch (error) {
            console.error('解密过程中出错:', error);
            rl.close();
        }
    });
}

// 运行主函数
main();
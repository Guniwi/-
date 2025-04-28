/**
 * 项目加密工具
 * 使用AES加密算法对项目中的所有文件和文件名进行加密
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

// 要排除的目录和文件
const EXCLUDED_PATHS = [
    '.cursor',
    'encrypt_project.js',
    'decrypt_project.js',
    'encrypted_files.json',
    'node_modules'
];

// 加密文件内容
function encryptContent(contentBuffer, password) {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(password, 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);

    const encrypted = Buffer.concat([cipher.update(contentBuffer), cipher.final()]);

    return {
        iv: iv.toString('hex'),
        content: encrypted.toString('hex')
    };
}

// 加密文件名
function encryptFileName(fileName, password) {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(password, 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);

    let encrypted = cipher.update(fileName, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return {
        iv: iv.toString('hex'),
        fileName: encrypted
    };
}

// 递归处理目录
async function processDirectory(dirPath, password, fileMap, originalBasePath) {
    const relativePath = path.relative(originalBasePath, dirPath);
    if (EXCLUDED_PATHS.some(excluded => relativePath.startsWith(excluded))) {
        console.log(`跳过排除的路径: ${relativePath}`);
        return;
    }

    const items = fs.readdirSync(dirPath);

    for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const relativeItemPath = path.relative(originalBasePath, itemPath);

        if (EXCLUDED_PATHS.some(excluded => relativeItemPath.startsWith(excluded))) {
            console.log(`跳过排除的文件/目录: ${relativeItemPath}`);
            continue;
        }

        const stats = fs.statSync(itemPath);

        if (stats.isDirectory()) {
            // 处理目录
            const encryptedDirName = encryptFileName(item, password);
            const newDirPath = path.join(path.dirname(itemPath), encryptedDirName.fileName);

            // 记录目录信息
            fileMap[relativeItemPath] = {
                type: 'directory',
                encryptedName: encryptedDirName.fileName,
                nameIv: encryptedDirName.iv
            };

            // 递归处理子目录
            await processDirectory(itemPath, password, fileMap, originalBasePath);
        } else {
            // 处理文件
            const contentBuffer = fs.readFileSync(itemPath); // 不指定编码，支持二进制
            const encryptedContent = encryptContent(contentBuffer, password);
            const encryptedFileName = encryptFileName(item, password);

            // 记录文件信息
            fileMap[relativeItemPath] = {
                type: 'file',
                encryptedName: encryptedFileName.fileName,
                nameIv: encryptedFileName.iv,
                contentIv: encryptedContent.iv,
                encryptedContent: encryptedContent.content
            };

            console.log(`已加密文件: ${relativeItemPath}`);
        }
    }
}

// 应用加密后的文件名
function applyEncryptedNames(fileMap, basePath) {
    // 按照路径深度排序，确保先重命名深层目录中的文件
    const sortedPaths = Object.keys(fileMap).sort((a, b) => {
        return b.split(path.sep).length - a.split(path.sep).length;
    });

    for (const itemPath of sortedPaths) {
        const info = fileMap[itemPath];
        const fullPath = path.join(basePath, itemPath);
        const dirName = path.dirname(fullPath);
        const newName = path.join(dirName, info.encryptedName);

        if (info.type === 'file') {
            // 写入加密内容
            fs.writeFileSync(fullPath, Buffer.from(info.encryptedContent, 'hex'));
            // 重命名文件
            fs.renameSync(fullPath, newName);
            console.log(`已重命名文件: ${itemPath} -> ${info.encryptedName}`);
        } else if (info.type === 'directory') {
            // 重命名目录
            if (fs.existsSync(fullPath)) {
                fs.renameSync(fullPath, newName);
                console.log(`已重命名目录: ${itemPath} -> ${info.encryptedName}`);
            }
        }
    }
}

// 主函数
async function main() {
    rl.question('请输入加密密码: ', async (password) => {
        if (!password) {
            console.error('错误: 密码不能为空');
            rl.close();
            return;
        }

        const basePath = process.cwd();
        const fileMap = {};

        console.log('开始扫描和加密文件...');

        try {
            await processDirectory(basePath, password, fileMap, basePath);

            // 保存加密映射信息
            fs.writeFileSync(
                path.join(basePath, 'encrypted_files.json'),
                JSON.stringify(fileMap, null, 2)
            );

            console.log('应用加密的文件名...');
            applyEncryptedNames(fileMap, basePath);

            console.log('加密完成! 加密映射已保存到 encrypted_files.json');
            console.log('请保存您的密码，解密时需要使用相同的密码');
        } catch (error) {
            console.error('加密过程中出错:', error);
        }

        rl.close();
    });
}

// 运行主函数
main();
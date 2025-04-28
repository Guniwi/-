/**
 * 项目加密工具
 * 使用AES加密算法对项目中的所有文件和文件名进行加密
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

// 要排除的目录和文件
const EXCLUDED_PATHS = [
    '.cursor',
    '.git',
    'encrypt_project.js',
    'decrypt_project.js',
    'encrypted_files.json',
    'node_modules'
];

// 监听SIGINT优雅退出
process.on('SIGINT', () => {
    console.log('\nOperation cancelled.');
    process.exit(0);
});

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
        console.log(`Skipping excluded path: ${relativePath}`);
        return;
    }

    const items = fs.readdirSync(dirPath);

    for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const relativeItemPath = path.relative(originalBasePath, itemPath);

        if (EXCLUDED_PATHS.some(excluded => relativeItemPath.startsWith(excluded))) {
            console.log(`Skipping excluded file/directory: ${relativeItemPath}`);
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
            let contentBuffer;
            let isText = true;
            try {
                // 优先尝试utf8编码
                const content = fs.readFileSync(itemPath, 'utf8');
                contentBuffer = Buffer.from(content, 'utf8');
            } catch (e) {
                // 失败则用二进制方式
                contentBuffer = fs.readFileSync(itemPath);
                isText = false;
            }
            const encryptedContent = encryptContent(contentBuffer, password);
            const encryptedFileName = encryptFileName(item, password);

            // 记录文件信息
            fileMap[relativeItemPath] = {
                type: 'file',
                encryptedName: encryptedFileName.fileName,
                nameIv: encryptedFileName.iv,
                contentIv: encryptedContent.iv,
                encryptedContent: encryptedContent.content,
                isText: isText
            };

            console.log(`Encrypted file: ${relativeItemPath}`);
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
            console.log(`Renamed file: ${itemPath} -> ${info.encryptedName}`);
        } else if (info.type === 'directory') {
            // 重命名目录
            if (fs.existsSync(fullPath)) {
                fs.renameSync(fullPath, newName);
                console.log(`Renamed directory: ${itemPath} -> ${info.encryptedName}`);
            }
        }
    }
}

// 主函数
async function main() {
    let password = '';
    while (true) {
        password = readlineSync.question('Enter encryption password (type exit to cancel, clear to re-enter): ', {hideEchoBack: true});
        if (password.toLowerCase() === 'exit') {
            console.log('Encryption cancelled.');
            process.exit(0);
        }
        if (password.toLowerCase() === 'clear') {
            continue;
        }
        if (!password) {
            console.error('Error: Password cannot be empty.');
            continue;
        }
        let password2 = readlineSync.question('Re-enter password to confirm: ', {hideEchoBack: true});
        if (password2.toLowerCase() === 'exit') {
            console.log('Encryption cancelled.');
            process.exit(0);
        }
        if (password2.toLowerCase() === 'clear') {
            continue;
        }
        if (password !== password2) {
            console.error('Passwords do not match, please try again.');
            continue;
        }
        break;
    }

    const basePath = process.cwd();
    const fileMap = {};

    console.log('Scanning and encrypting files...');

    try {
        await processDirectory(basePath, password, fileMap, basePath);

        // 保存加密映射信息
        fs.writeFileSync(
            path.join(basePath, 'encrypted_files.json'),
            JSON.stringify(fileMap, null, 2)
        );

        console.log('Applying encrypted filenames...');
        applyEncryptedNames(fileMap, basePath);

        console.log('Encryption complete! Mapping saved to encrypted_files.json');
        console.log('Please save your password. The same password is required for decryption.');
    } catch (error) {
        console.error('Error during encryption:', error);
    }
}

// 运行主函数
main();
export async function onRequest(context) {
    const GITHUB_TOKEN = context.env.GITHUB_TOKEN;
    const GITHUB_USERNAME = 'blindstone2026-commits'; // 已更新為新帳號
    const REPO_NAME = 'blind-stone-website'; // 已更新為新倉庫
    const FOLDER_PATH = 'content/articles';

    try {
        if (!GITHUB_TOKEN) {
            return new Response(JSON.stringify({ error: "Missing GITHUB_TOKEN" }), { status: 500, headers: { "Content-Type": "application/json" } });
        }

        const url = new URL(context.request.url);
        const articleId = url.searchParams.get('id');

        const headers = {
            'Authorization': `token ${GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Cloudflare-Pages'
        };

        // ========== 模式 A：單篇文章請求 ==========
        // ⚡️ 如果前端有傳入 id，我們只精準去拿那一篇文章的全文，速度提升 100 倍！
        if (articleId) {
            const metaUrl = `https://api.github.com/repos/${GITHUB_USERNAME}/${REPO_NAME}/contents/${FOLDER_PATH}/${articleId}.md`;
            const metaResponse = await fetch(metaUrl, { headers });
            
            if (!metaResponse.ok) throw new Error("Article not found");
            
            const metaData = await metaResponse.json();
            const fileResponse = await fetch(metaData.download_url);
            const rawContent = await fileResponse.text();
            
            // 為了相容前端，回傳同樣的陣列格式
            return new Response(JSON.stringify([{ id: articleId, rawContent: rawContent }]), { 
                status: 200, 
                headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" } 
            });
        }

        // ========== 模式 B：首頁 / 分類頁列表請求 ==========
        const listUrl = `https://api.github.com/repos/${GITHUB_USERNAME}/${REPO_NAME}/contents/${FOLDER_PATH}`;
        const listResponse = await fetch(listUrl, { headers });

        if (!listResponse.ok) throw new Error(`GitHub API Error: ${listResponse.status}`);
        
        const files = await listResponse.json();
        
        // ⚡️ 加速絕招 1：使用 Promise.all 讓所有檔案「同時」下載，取代原本排隊慢吞吞的迴圈
        const fetchPromises = files.filter(file => file.name.endsWith('.md')).map(async (file) => {
            const fileResponse = await fetch(file.download_url);
            const fullText = await fileResponse.text();
            
            // ⚡️ 加速絕招 2：自動瘦身！只保留 Markdown 前面的標頭資料 (Frontmatter)，丟掉底下萬字內文！
            let lightContent = fullText;
            const parts = fullText.split('---');
            if (parts.length >= 3) {
                // 重新把標頭組裝回去，讓前端的解析程式完美銜接
                lightContent = `---${parts[1]}---`; 
            }

            return { 
                id: file.name.replace('.md', ''), 
                rawContent: lightContent 
            };
        });

        // 等待所有檔案「平行」下載完畢
        const articles = await Promise.all(fetchPromises);

        return new Response(JSON.stringify(articles), { 
            status: 200, 
            headers: { 
                "Content-Type": "application/json",
                // 加上 Cloudflare 快取指令，讓它在邊緣節點活得更久
                "Cache-Control": "public, s-maxage=3600" 
            } 
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
}

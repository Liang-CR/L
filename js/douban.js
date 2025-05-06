// 豆瓣热门电影电视剧推荐功能

// 防抖函数 - 优化频繁操作
const debounce = (fn, delay = 300) => {
  let timer = null;
  return (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
};

// 安全处理HTML字符串 - 防XSS
const safeText = (text) => {
  if (!text) return '';
  return String(text)
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
};

// 豆瓣标签列表 - 修改为默认标签
const defaultMovieTags = ['热门', '最新', '经典', '豆瓣高分', '冷门佳片', '华语', '欧美', '韩国', '日本', '动作', '喜剧', '爱情', '科幻', '悬疑', '恐怖', '治愈'];
const defaultTvTags = ['热门', '美剧', '英剧', '韩剧', '日剧', '国产剧', '港剧', '日本动画', '综艺', '纪录片'];

// 用户标签列表 - 存储用户实际使用的标签（包含保留的系统标签和用户添加的自定义标签）
let movieTags = [];
let tvTags = [];

// 应用状态变量
let doubanMovieTvCurrentSwitch = 'movie';
let doubanCurrentTag = '热门';
let doubanPageStart = 0;
const doubanPageSize = 16; // 一次显示的项目数量

// 加载用户标签
function loadUserTags() {
  try {
    // 尝试从本地存储加载用户保存的标签
    const savedMovieTags = localStorage.getItem('userMovieTags');
    const savedTvTags = localStorage.getItem('userTvTags');

    // 如果本地存储中有标签数据，则使用它
    movieTags = savedMovieTags ? JSON.parse(savedMovieTags) : [...defaultMovieTags];
    tvTags = savedTvTags ? JSON.parse(savedTvTags) : [...defaultTvTags];
  } catch (e) {
    console.error('加载标签失败：', e);
    // 初始化为默认值，防止错误
    movieTags = [...defaultMovieTags];
    tvTags = [...defaultTvTags];
  }
}

// 保存用户标签
function saveUserTags() {
  try {
    localStorage.setItem('userMovieTags', JSON.stringify(movieTags));
    localStorage.setItem('userTvTags', JSON.stringify(tvTags));
  } catch (e) {
    console.error('保存标签失败：', e);
    showToast('保存标签失败', 'error');
  }
}

// 初始化豆瓣功能
function initDouban() {
  // 设置豆瓣开关的初始状态
  const doubanToggle = document.getElementById('doubanToggle');
  if (doubanToggle) {
    const isEnabled = localStorage.getItem('doubanEnabled') === 'true';
    doubanToggle.checked = isEnabled;

    // 设置开关外观
    const toggleBg = doubanToggle.nextElementSibling;
    const toggleDot = toggleBg.nextElementSibling;
    
    if (isEnabled) {
      toggleBg.classList.add('bg-pink-600');
      toggleDot.classList.add('translate-x-6');
    }

    // 添加事件监听
    doubanToggle.addEventListener('change', function(e) {
      const isChecked = e.target.checked;
      localStorage.setItem('doubanEnabled', isChecked);

      // 更新开关外观
      if (isChecked) {
        toggleBg.classList.add('bg-pink-600');
        toggleDot.classList.add('translate-x-6');
      } else {
        toggleBg.classList.remove('bg-pink-600');
        toggleDot.classList.remove('translate-x-6');
      }

      // 更新显示状态
      updateDoubanVisibility();
    });

    // 初始更新显示状态
    updateDoubanVisibility();
  }

  // 加载用户标签
  loadUserTags();

  // 渲染电影/电视剧切换
  renderDoubanMovieTvSwitch();

  // 渲染豆瓣标签
  renderDoubanTags();

  // 换一批按钮事件监听
  setupDoubanRefreshBtn();

  // 初始加载热门内容
  if (localStorage.getItem('doubanEnabled') === 'true') {
    renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart);
  }
}

// 根据设置更新豆瓣区域的显示状态
function updateDoubanVisibility() {
  const doubanArea = document.getElementById('doubanArea');
  if (!doubanArea) return;

  const isEnabled = localStorage.getItem('doubanEnabled') === 'true';
  const resultsArea = document.getElementById('resultsArea');
  const isSearching = resultsArea && !resultsArea.classList.contains('hidden');

  // 只有在启用且没有搜索结果显示时才显示豆瓣区域
  if (isEnabled && !isSearching) {
    doubanArea.classList.remove('hidden');
    // 如果豆瓣结果为空，重新加载
    const doubanResults = document.getElementById('douban-results');
    if (doubanResults && doubanResults.children.length === 0) {
      renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart);
    }
  } else {
    doubanArea.classList.add('hidden');
  }
}

// 只填充搜索框，不执行搜索，让用户自主决定搜索时机
function fillSearchInput(title) {
  if (!title) return;

  const safeTitle = safeText(title);
  const input = document.getElementById('searchInput');
  
  if (input) {
    input.value = safeTitle;
    // 聚焦搜索框，便于用户立即使用键盘操作
    input.focus();
    // 显示一个提示，告知用户点击搜索按钮进行搜索
    showToast('已填充搜索内容，点击搜索按钮开始搜索', 'info');
  }
}

// 填充搜索框并执行搜索
function fillAndSearch(title) {
  if (!title) return;

  const safeTitle = safeText(title);
  const input = document.getElementById('searchInput');
  
  if (input) {
    input.value = safeTitle;
    // 调用全局search函数执行搜索
    if (typeof search === 'function') {
      search();
    } else {
      console.error('search函数不可用');
      showToast('搜索功能暂不可用', 'error');
    }
  }
}

// 填充搜索框，确保豆瓣资源API被选中，然后执行搜索
function fillAndSearchWithDouban(title) {
  if (!title) return;

  const safeTitle = safeText(title);

  // 确保豆瓣资源API被选中
  if (typeof selectedAPIs !== 'undefined' && !selectedAPIs.includes('dbzy')) {
    // 在设置中勾选豆瓣资源API复选框
    const doubanCheckbox = document.querySelector('input[id="api_dbzy"]');
    if (doubanCheckbox) {
      doubanCheckbox.checked = true;

      // 触发updateSelectedAPIs函数以更新状态
      if (typeof updateSelectedAPIs === 'function') {
        updateSelectedAPIs();
      } else {
        // 如果函数不可用，则手动添加到selectedAPIs
        selectedAPIs.push('dbzy');
        localStorage.setItem('selectedAPIs', JSON.stringify(selectedAPIs));

        // 更新选中API计数（如果有这个元素）
        const countEl = document.getElementById('selectedAPICount');
        if (countEl) {
          countEl.textContent = selectedAPIs.length;
        }
      }

      showToast('已自动选择豆瓣资源API', 'info');
    }
  }

  // 填充搜索框并执行搜索
  const input = document.getElementById('searchInput');
  if (input) {
    input.value = safeTitle;
    if (typeof search === 'function') {
      search();
    } else {
      console.error('search函数不可用');
      showToast('搜索功能暂不可用', 'error');
    }
  }
}

// 渲染电影/电视剧切换器
function renderDoubanMovieTvSwitch() {
  // 获取切换按钮元素
  const movieToggle = document.getElementById('douban-movie-toggle');
  const tvToggle = document.getElementById('douban-tv-toggle');

  if (!movieToggle || !tvToggle) return;

  // 电影按钮点击事件处理
  movieToggle.addEventListener('click', function() {
    if (doubanMovieTvCurrentSwitch !== 'movie') {
      // 更新按钮样式
      movieToggle.classList.add('bg-pink-600', 'text-white');
      movieToggle.classList.remove('text-gray-300');

      tvToggle.classList.remove('bg-pink-600', 'text-white');
      tvToggle.classList.add('text-gray-300');

      doubanMovieTvCurrentSwitch = 'movie';
      doubanCurrentTag = '热门';
      doubanPageStart = 0;

      // 重新加载豆瓣内容
      renderDoubanTags();
      
      // 初始加载热门内容
      if (localStorage.getItem('doubanEnabled') === 'true') {
        renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart);
      }
    }
  });

  // 电视剧按钮点击事件
  tvToggle.addEventListener('click', function() {
    if (doubanMovieTvCurrentSwitch !== 'tv') {
      // 更新按钮样式
      tvToggle.classList.add('bg-pink-600', 'text-white');
      tvToggle.classList.remove('text-gray-300');

      movieToggle.classList.remove('bg-pink-600', 'text-white');
      movieToggle.classList.add('text-gray-300');

      doubanMovieTvCurrentSwitch = 'tv';
      doubanCurrentTag = '热门';
      doubanPageStart = 0;

      // 重新加载豆瓣内容
      renderDoubanTags();
      
      // 初始加载热门内容
      if (localStorage.getItem('doubanEnabled') === 'true') {
        renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart);
      }
    }
  });
}

// 渲染豆瓣标签选择器
function renderDoubanTags() {
  const tagContainer = document.getElementById('douban-tags');
  if (!tagContainer) return;

  // 确定当前应该使用的标签列表
  const currentTags = doubanMovieTvCurrentSwitch === 'movie' ? movieTags : tvTags;

  // 使用文档片段提高性能
  const fragment = document.createDocumentFragment();

  // 先添加标签管理按钮
  const manageBtn = document.createElement('button');
  manageBtn.className = 'py-1.5 px-3.5 rounded text-sm font-medium transition-all duration-300 bg-[#1a1a1a] text-gray-300 hover:bg-pink-700 hover:text-white';
  manageBtn.innerHTML = '<span class="flex items-center"><svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>管理标签</span>';
  manageBtn.onclick = function() {
    showTagManageModal();
  };
  fragment.appendChild(manageBtn);

  // 添加所有标签
  currentTags.forEach(tag => {
    const btn = document.createElement('button');

    // 设置样式
    let btnClass = 'py-1.5 px-3.5 rounded text-sm font-medium transition-all duration-300 ';

    // 当前选中的标签使用高亮样式
    if (tag === doubanCurrentTag) {
      btnClass += 'bg-pink-600 text-white shadow-md';
    } else {
      btnClass += 'bg-[#1a1a1a] text-gray-300 hover:bg-pink-700 hover:text-white';
    }

    btn.className = btnClass;
    btn.textContent = tag;

    // 使用节流函数防止快速点击
    btn.onclick = debounce(function() {
      if (doubanCurrentTag !== tag) {
        doubanCurrentTag = tag;
        doubanPageStart = 0;
        renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart);
        renderDoubanTags();
      }
    }, 300);

    fragment.appendChild(btn);
  });

  // 清空并添加所有新元素
  tagContainer.innerHTML = '';
  tagContainer.appendChild(fragment);
}

// 设置换一批按钮事件
function setupDoubanRefreshBtn() {
  const btn = document.getElementById('douban-refresh');
  if (!btn) return;

  // 使用防抖处理连续点击
  btn.onclick = debounce(function() {
    doubanPageStart += doubanPageSize;
    if (doubanPageStart > 9 * doubanPageSize) {
      doubanPageStart = 0;
    }

    renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart);
  }, 500);
}

// 获取豆瓣标签列表 (未使用，保留接口)
function fetchDoubanTags() {
  const movieTagsTarget = `https://movie.douban.com/j/search_tags?type=movie`;
  fetchDoubanData(movieTagsTarget)
    .then(data => {
      if (data && data.tags) {
        movieTags = data.tags;
        if (doubanMovieTvCurrentSwitch === 'movie') {
          renderDoubanTags();
        }
      }
    })
    .catch(error => {
      console.error("获取豆瓣热门电影标签失败：", error);
    });
    
  const tvTagsTarget = `https://movie.douban.com/j/search_tags?type=tv`;
  fetchDoubanData(tvTagsTarget)
    .then(data => {
      if (data && data.tags) {
        tvTags = data.tags;
        if (doubanMovieTvCurrentSwitch === 'tv') {
          renderDoubanTags();
        }
      }
    })
    .catch(error => {
      console.error("获取豆瓣热门电视剧标签失败：", error);
    });
}

// 渲染热门推荐内容
function renderRecommend(tag, pageLimit, pageStart) {
  const container = document.getElementById("douban-results");
  if (!container) return;

  // 创建加载状态元素
  const loadingOverlay = document.createElement("div");
  loadingOverlay.classList.add(
    "absolute",
    "inset-0",
    "bg-gray-100",
    "bg-opacity-75",
    "flex",
    "items-center",
    "justify-center",
    "z-10"
  );

  const loadingContent = document.createElement("div");
  loadingContent.innerHTML = `
    <div class="flex items-center justify-center">
        <div class="w-6 h-6 border-2 border-pink-500 border-t-transparent rounded-full animate-spin inline-block"></div>
        <span class="text-pink-500 ml-4">加载中...</span>
    </div>
  `;
  loadingOverlay.appendChild(loadingContent);

  // 冻结原有内容，并添加加载状态
  container.classList.add("relative");
  container.appendChild(loadingOverlay);

  // 构建请求URL
  const target = `https://movie.douban.com/j/search_subjects?type=${doubanMovieTvCurrentSwitch}&tag=${encodeURIComponent(tag)}&sort=recommend&page_limit=${pageLimit}&page_start=${pageStart}`;

  // 使用通用请求函数
  fetchDoubanData(target)
    .then(data => {
      renderDoubanCards(data, container);
    })
    .catch(error => {
      console.error("获取豆瓣数据失败：", error);
      container.innerHTML = `
        <div class="col-span-full text-center py-8">
            <div class="text-red-400">❌ 获取豆瓣数据失败，请稍后重试</div>
            <div class="text-gray-500 text-sm mt-2">提示：使用VPN可能有助于解决此问题</div>
        </div>
      `;
    })
    .finally(() => {
      // 无论成功失败都移除加载状态
      if (container.contains(loadingOverlay)) {
        container.removeChild(loadingOverlay);
      }
    });
}

// 网络请求方法，增强了错误处理
async function fetchDoubanData(url) {
  // 添加超时控制
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时

  // 设置请求选项，包括信号和头部
  const fetchOptions = {
    signal: controller.signal,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Referer': 'https://movie.douban.com/',
      'Accept': 'application/json, text/plain, */*',
    }
  };

  try {
    // 确保PROXY_URL存在
    if (typeof PROXY_URL === 'undefined') {
      console.error('PROXY_URL未定义');
      throw new Error('代理URL配置缺失');
    }

    // 主要请求方法
    const response = await fetch(PROXY_URL + encodeURIComponent(url), fetchOptions);
    clearTimeout(timeoutId); // 清理超时计时器

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    return await response.json();
  } catch (err) {
    // 清理超时计时器
    clearTimeout(timeoutId);
    
    // 错误日志
    console.error("豆瓣 API 请求失败：", err);

    // 超时错误特别处理
    if (err.name === 'AbortError') {
      throw new Error('请求超时，请检查网络后重试');
    }

    // 尝试备用方法
    const fallbackUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;

    try {
      const fallbackResponse = await fetch(fallbackUrl);

      if (!fallbackResponse.ok) {
        throw new Error(`备用API请求失败! 状态: ${fallbackResponse.status}`);
      }

      const data = await fallbackResponse.json();

      // 解析原始内容
      if (data && data.contents) {
        return JSON.parse(data.contents);
      } else {
        throw new Error("无法获取有效数据");
      }
    } catch (fallbackErr) {
      console.error("豆瓣 API 备用请求也失败：", fallbackErr);
      throw new Error('获取数据失败，请稍后重试');
    }
  }
}

// 渲染豆瓣卡片
function renderDoubanCards(data, container) {
  // 创建文档片段以提高性能
  const fragment = document.createDocumentFragment();

  // 如果没有数据
  if (!data || !data.subjects || data.subjects.length === 0) {
    const emptyEl = document.createElement("div");
    emptyEl.className = "col-span-full text-center py-8";
    emptyEl.innerHTML = `
      <div class="text-pink-500">❌ 暂无数据，请尝试其他分类或刷新</div>
    `;
    fragment.appendChild(emptyEl);
  } else {
    // 循环创建每个影视卡片
    data.subjects.forEach(item => {
      // 安全处理数据
      const safeTitle = safeText(item.title);
      const safeRate = safeText(item.rate || "暂无");
      const safeUrl = item.url || "#";
      
      // 处理图片URL
      const originalCoverUrl = item.cover || "";
      const proxiedCoverUrl = typeof PROXY_URL !== 'undefined' ? 
                             PROXY_URL + encodeURIComponent(originalCoverUrl) : 
                             originalCoverUrl;

      // 创建卡片元素
      const card = document.createElement("div");
      card.className = "bg-[#111] hover:bg-[#222] transition-all duration-300 rounded-lg overflow-hidden flex flex-col transform hover:scale-105 shadow-md hover:shadow-lg";

      // 生成卡片内容
      card.innerHTML = `
        <div class="relative w-full aspect-[2/3] overflow-hidden cursor-pointer" onclick="fillAndSearchWithDouban('${safeTitle}')">
          <img src="${originalCoverUrl}" alt="${safeTitle}"
              class="w-full h-full object-cover transition-transform duration-500 hover:scale-110"
              onerror="this.onerror=null; this.src='${proxiedCoverUrl}'; this.classList.add('object-contain');"
              loading="lazy" referrerpolicy="no-referrer">
          <div class="absolute inset-0 bg-gradient-to-t from-black to-transparent opacity-60"></div>
          <div class="absolute bottom-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded-sm">
              <span class="text-yellow-400">★</span> ${safeRate}
          </div>
          <div class="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded-sm hover:bg-[#333] transition-colors">
              <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" title="在豆瓣查看" onclick="event.stopPropagation();">
                  🔗
              </a>
          </div>
        </div>
        <div class="p-2 text-center bg-[#111]">
          <button onclick="fillAndSearchWithDouban('${safeTitle}')"
                  class="text-sm font-medium text-white truncate w-full hover:text-pink-400 transition"
                  title="${safeTitle}">
              ${safeTitle}
          </button>
        </div>
      `;

      fragment.appendChild(card);
    });
  }

  // 清空并添加所有新元素
  container.innerHTML = "";
  container.appendChild(fragment);
}

// 重置到首页
function resetToHome() {
  // 假设 resetSearchArea 是全局函数
  if (typeof resetSearchArea === 'function') {
    resetSearchArea();
  }
  updateDoubanVisibility();
}

// 显示标签管理模态框
function showTagManageModal() {
  // 确保模态框在页面上只有一个实例
  let modal = document.getElementById('tagManageModal');
  if (modal) {
    document.body.removeChild(modal);
  }

  // 创建模态框元素
  modal = document.createElement('div');
  modal.id = 'tagManageModal';
  modal.className = 'fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50';

  // 当前使用的标签类型和默认标签
  const isMovie = doubanMovieTvCurrentSwitch === 'movie';
  const currentTags = isMovie ? movieTags : tvTags;

  // 模态框内容
  modal.innerHTML = `
    <div class="bg-[#191919] rounded-lg p-6 max-w-md w-full max-h-[90vh] overflow-y-auto relative">
      <button id="closeTagModal" class="absolute top-4 right-4 text-gray-400 hover:text-white text-xl">&times;</button>

      <h3 class="text-xl font-bold text-white mb-4">标签管理 (${isMovie ? '电影' : '电视剧'})</h3>

      <div class="mb-4">
        <div class="flex justify-between items-center mb-2">
          <h4 class="text-lg font-medium text-gray-300">标签列表</h4>
          <button id="resetTagsBtn" class="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded">
            恢复默认标签
          </button>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4" id="tagsGrid">
          ${currentTags.length ? currentTags.map(tag => {
            // "热门"标签不能删除
            const canDelete = tag !== '热门';
            return `
              <div class="bg-[#1a1a1a] text-gray-300 py-1.5 px-3 rounded text-sm font-medium flex justify-between items-center group">
                <span>${safeText(tag)}</span>
                ${canDelete ?
                  `<button class="delete-tag-btn text-gray-500 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    data-tag="${safeText(tag)}">✕</button>` :
                  `<span class="text-gray-500 text-xs italic opacity-0 group-hover:opacity-100">必需</span>`
                }
              </div>
            `;
          }).join('') :
          `<div class="col-span-full text-center py-4 text-gray-500">无标签，请添加或恢复默认</div>`}
        </div>
      </div>

      <div class="border-t border-gray-700 pt-4">
        <h4 class="text-lg font-medium text-gray-300 mb-3">添加新标签</h4>
        <form id="addTagForm" class="flex items-center">
          <input type="text" id="newTagInput" placeholder="输入标签名称..."
                 class="flex-1 bg-[#222] text-white border border-gray-700 rounded px-3 py-2 focus:outline-none focus:border-pink-500"
                 maxlength="20">
          <button type="submit" class="ml-2 bg-pink-600 hover:bg-pink-700 text-white px-4 py-2 rounded">添加</button>
        </form>
        <p class="text-xs text-gray-500 mt-2">提示：标签名称不能为空，不能重复，不能包含特殊字符</p>
      </div>
    </div>
  `;

  // 添加模态框到页面
  document.body.appendChild(modal);

  // 焦点放在输入框上
  setTimeout(() => {
    const input = document.getElementById('newTagInput');
    if (input) input.focus();
  }, 100);

  // 添加事件监听器 - 关闭按钮
  const closeBtn = document.getElementById('closeTagModal');
  if (closeBtn) {
    closeBtn.addEventListener('click', function() {
      document.body.removeChild(modal);
    });
  }

  // 添加事件监听器 - 点击模态框外部关闭
  modal.addEventListener('click', function(e) {
    if (e.target === modal) {
      document.body.removeChild(modal);
    }
  });

  // 添加事件监听器 - 恢复默认标签按钮
  const resetBtn = document.getElementById('resetTagsBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', function() {
      resetTagsToDefault();
      showTagManageModal(); // 重新加载模态框
    });
  }
  // 添加事件监听器 - 删除标签按钮
  const deleteButtons = document.querySelectorAll('.delete-tag-btn');
  deleteButtons.forEach(btn => {
    btn.addEventListener('click', function() {
      const tagToDelete = this.getAttribute('data-tag');
      deleteTag(tagToDelete);
      showTagManageModal(); // 重新加载模态框
    });
  });

  // 添加事件监听器 - 表单提交
  const addForm = document.getElementById('addTagForm');
  if (addForm) {
    addForm.addEventListener('submit', function(e) {
      e.preventDefault();
      const input = document.getElementById('newTagInput');
      if (!input) return;
      
      const newTag = input.value.trim();

      if (newTag) {
        addTag(newTag);
        input.value = '';
        showTagManageModal(); // 重新加载模态框
      }
    });
  }
}

// 添加标签
function addTag(tag) {
  if (!tag || typeof tag !== 'string') {
    showToast('标签不能为空', 'warning');
    return;
  }

  // 验证标签格式
  if (!/^[\u4e00-\u9fa5a-zA-Z0-9\s]+$/.test(tag)) {
    showToast('标签只能包含中文、英文、数字和空格', 'warning'); 
    return;
  }

  // 限制标签长度
  if (tag.length > 20) {
    showToast('标签长度不能超过20个字符', 'warning');
    return;
  }

  // 安全处理标签名
  const safeTag = safeText(tag);

  // 确定当前使用的是电影还是电视剧标签
  const isMovie = doubanMovieTvCurrentSwitch === 'movie';
  const currentTags = isMovie ? movieTags : tvTags;

  // 检查是否已存在（忽略大小写）
  const exists = currentTags.some(
    existingTag => existingTag.toLowerCase() === safeTag.toLowerCase()
  );

  if (exists) {
    showToast('标签已存在', 'warning');
    return;
  }

  // 添加到对应的标签数组
  if (isMovie) {
    movieTags.push(safeTag);
  } else {
    tvTags.push(safeTag);
  }

  // 保存到本地存储
  saveUserTags();

  // 重新渲染标签
  renderDoubanTags();

  showToast('标签添加成功', 'success');
}

// 删除标签
function deleteTag(tag) {
  if (!tag) return;
  
  // 热门标签不能删除
  if (tag === '热门') {
    showToast('热门标签不能删除', 'warning');
    return;
  }

  // 确定当前使用的是电影还是电视剧标签
  const isMovie = doubanMovieTvCurrentSwitch === 'movie';
  const currentTags = isMovie ? movieTags : tvTags;

  // 寻找标签索引
  const index = currentTags.indexOf(tag);

  // 如果找到标签，则删除
  if (index !== -1) {
    currentTags.splice(index, 1);

    // 保存到本地存储
    saveUserTags();

    // 如果当前选中的是被删除的标签，则重置为"热门"
    if (doubanCurrentTag === tag) {
      doubanCurrentTag = '热门';
      doubanPageStart = 0;
      renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart);
    }

    // 重新渲染标签
    renderDoubanTags();

    showToast('标签删除成功', 'success');
  }
}

// 重置为默认标签
function resetTagsToDefault() {
  // 确定当前使用的是电影还是电视剧
  const isMovie = doubanMovieTvCurrentSwitch === 'movie';

  // 重置为默认标签
  if (isMovie) {
    movieTags = [...defaultMovieTags];
  } else {
    tvTags = [...defaultTvTags];
  }

  // 设置当前标签为热门
  doubanCurrentTag = '热门';
  doubanPageStart = 0;

  // 保存到本地存储
  saveUserTags();

  // 重新渲染标签和内容
  renderDoubanTags();
  renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart);

  showToast('已恢复默认标签', 'success');
}

// 初始化：DOMContentLoaded 事件发生时加载豆瓣功能
document.addEventListener('DOMContentLoaded', initDouban);



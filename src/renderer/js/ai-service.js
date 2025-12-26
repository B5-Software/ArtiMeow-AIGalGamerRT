/**
 * AI服务管理器
 */

class AIService {
  constructor() {
    this.textConfig = null;
    this.imageConfig = null;
    this.isGenerating = false;
    this.loadSettings();
  }

  /**
   * 加载AI配置
   */
  async loadSettings() {
    try {
      let settings;
      
      // 优先从 Electron 存储读取（与设置管理器保持一致）
      if (window.electronAPI && window.electronAPI.storage) {
        try {
          settings = await window.electronAPI.storage.get('appSettings');
        } catch (e) {
          console.warn('从Electron存储加载AI设置失败，回退localStorage:', e);
        }
      }
      
      // 回退 localStorage（新键artimeow-settings）
      if (!settings) {
        const stored = localStorage.getItem('artimeow-settings');
        settings = stored ? JSON.parse(stored) : null;
      }

      // 兼容旧键appSettings（迁移支持）
      if (!settings) {
        const legacy = localStorage.getItem('appSettings');
        settings = legacy ? JSON.parse(legacy) : {};
      }

      // 如果还是没有设置，使用空对象
      if (!settings) {
        settings = {};
      }
      
      this.textConfig = {
        type: settings.textModelType || 'openai',
        url: settings.textApiUrl || 'https://api.openai.com/v1',
        apiKey: settings.textApiKey || '',
        model: settings.textModel || 'gpt-4o-mini'
      };

      this.imageConfig = {
        type: settings.imageModelType || 'openai',
        url: settings.imageApiUrl || 'https://api.openai.com/v1',
        apiKey: settings.imageApiKey || '',
        model: settings.imageModel || 'dall-e-3',
        resolution: settings.imageResolution || '1024x1024'
      };
    } catch (error) {
      console.error('加载AI设置失败:', error);
    }
  }

  /**
   * 保存AI配置
   * @param {Object} settings - 设置对象
   */
  async saveSettings(settings) {
    try {
      // 使用与设置管理器相同的存储策略
      if (window.electronAPI && window.electronAPI.storage) {
        try {
          await window.electronAPI.storage.set('appSettings', settings);
        } catch (e) {
          console.warn('保存AI设置到Electron存储失败，回退localStorage:', e);
          // 如果Electron存储失败，回退到localStorage
          localStorage.setItem('artimeow-settings', JSON.stringify(settings));
        }
      } else {
        // 没有Electron API时直接使用localStorage
        localStorage.setItem('artimeow-settings', JSON.stringify(settings));
      }
      
      // 重新加载设置以确保同步
      await this.loadSettings();
    } catch (error) {
      console.error('保存AI设置失败:', error);
    }
  }

  /**
   * 检查AI是否已配置
   */
  isConfigured() {
    return this.textConfig && this.textConfig.apiKey && this.textConfig.apiKey.trim() !== '';
  }

  /**
   * 检查图像生成是否已配置
   */
  isImageConfigured() {
    return this.imageConfig && this.imageConfig.apiKey && this.imageConfig.apiKey.trim() !== '';
  }

  /**
   * 生成故事内容
   * @param {Object} context - 上下文信息
   * @param {Object} knowledgeBase - 知识库
   * @param {string} userChoice - 用户选择
   * @param {AbortSignal} signal - 中断信号
   */
  async generateStoryContent(context, knowledgeBase, userChoice = '', signal = null) {
    if (this.isGenerating) {
      throw new Error('正在生成中，请稍候...');
    }

    if (!this.textConfig.apiKey) {
      throw new Error('请先配置文本生成API');
    }

    this.isGenerating = true;

    try {
      // 检查中断信号
      if (signal?.aborted) {
        throw new DOMException('Request was aborted', 'AbortError');
      }

      const prompt = await this.buildPrompt(context, knowledgeBase, userChoice);
      const maxRetries = 3;
      let lastErr = null;
      for (let i = 0; i < maxRetries; i++) {
        // 再次检查中断信号
        if (signal?.aborted) {
          throw new DOMException('Request was aborted', 'AbortError');
        }
        
        try {
          const response = await this.callTextAPI(prompt, signal);
          const parsedResponse = this.parseAIResponse(response);
          if (this.validateResponse(parsedResponse)) {
            return parsedResponse;
          }
          lastErr = new Error('AI响应缺少必填字段');
        } catch (e) {
          // 如果是中断错误，直接抛出
          if (e.name === 'AbortError') {
            throw e;
          }
          lastErr = e;
        }
      }
      throw lastErr || new Error('AI响应无效');

    } catch (error) {
      console.error('生成故事内容失败:', error);
      throw error;
    } finally {
      this.isGenerating = false;
    }
  }

  /**
   * 生成图像并下载到本地
   * @param {string} prompt - 图像描述
   * @param {Object} options - 选项
   */
  async generateImage(prompt, options = {}) {
    if (!this.imageConfig.apiKey) {
      throw new Error('请先配置图像生成API');
    }

    const { signal } = options;

    try {
      // 检查中断信号
      if (signal?.aborted) {
        throw new DOMException('Request was aborted', 'AbortError');
      }

      // 第一步：文本处理
      if (options.onProgress) {
        options.onProgress({ stage: '文本生成', percent: 5 });
      }

      // 第二步：图片生成（10-75%）
      if (options.onProgress) {
        options.onProgress({ stage: '图片生成', percent: 10 });
      }

      const imageUrl = await this.callImageAPI(prompt, (progressInfo) => {
        // 检查中断信号
        if (signal?.aborted) {
          throw new DOMException('Request was aborted', 'AbortError');
        }
        
        if (options.onProgress) {
          const adjustedPercent = 10 + (progressInfo.percent * 0.65); // 10-75%
          options.onProgress({ 
            stage: '图片生成', 
            percent: adjustedPercent 
          });
        }
      }, signal);

      // 再次检查中断信号
      if (signal?.aborted) {
        throw new DOMException('Request was aborted', 'AbortError');
      }

      // 第三步：图片下载（75-100%）
      if (options.onProgress) {
        options.onProgress({ stage: '图片下载', percent: 75 });
      }

      const localPath = await this.downloadImage(imageUrl, options.projectId, options.filename, signal, options.outputDir);

      if (options.onProgress) {
        options.onProgress({ stage: '完成', percent: 100 });
      }

      return localPath;
    } catch (error) {
      console.error('生成图像失败:', error);
      throw error;
    }
  }

  /**
   * 下载图片到本地项目目录
   * @param {string} imageUrl - 图片URL
   * @param {string} projectId - 项目ID
   * @param {string} filename - 文件名（可选）
   * @param {AbortSignal} signal - 中断信号
   * @param {string} outputDir - 输出目录（可选，用于主页背景等）
   */
  async downloadImage(imageUrl, projectId, filename, signal = null, outputDir = null) {
    try {
      // 检查中断信号
      if (signal?.aborted) {
        throw new DOMException('Request was aborted', 'AbortError');
      }

      // 生成唯一文件名
      if (!filename) {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        filename = `image_${timestamp}_${random}.png`;
      }

      // 确保文件扩展名
      if (!filename.match(/\.(png|jpg|jpeg|webp)$/i)) {
        filename += '.png';
      }

      let assetDir;
      let project = null;
      let assetPath;
      
      if (outputDir) {
        // 使用指定的输出目录（用于主页背景等）
        assetDir = outputDir;
        await window.electronAPI.fs.ensureDir(assetDir);
        assetPath = `${assetDir}/${filename}`;
      } else {
        // 获取项目asset目录
        console.log('查找项目:', projectId, '可用项目:', window.projectManager.getProjects().map(p => ({id: p.id, name: p.name})));
        
        project = window.projectManager.getProjects().find(p => p.id === projectId);
        
        // 如果找不到项目，尝试重新加载项目列表
        if (!project) {
          await window.projectManager.loadProjects();
          project = window.projectManager.getProjects().find(p => p.id === projectId);
        }
        
        if (!project) {
          console.error('项目不存在，projectId:', projectId, '所有项目:', window.projectManager.getProjects());
          // 如果仍然找不到项目，返回原始URL而不是抛出错误
          return imageUrl;
        }

        assetDir = `${project.path}/assets`;
        assetPath = await window.projectManager.getAssetPath(project, filename);
      }

      // 再次检查中断信号
      if (signal?.aborted) {
        throw new DOMException('Request was aborted', 'AbortError');
      }

      // 下载图片
      const response = await fetch(imageUrl, { signal });
      if (!response.ok) {
        throw new Error(`下载图片失败: ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      // 保存到本地
      if (window.electronAPI && window.electronAPI.fs) {
        try {
          await window.electronAPI.fs.ensureDir(assetPath.replace(filename, ''));
          // 使用正确的文件写入方法
          if (window.electronAPI.fs.writeFile) {
            await window.electronAPI.fs.writeFile(assetPath, uint8Array);
          } else if (window.electronAPI.writeFile) {
            await window.electronAPI.writeFile(assetPath, uint8Array);
          } else {
            throw new Error('文件写入API不可用');
          }
        } catch (fsError) {
          console.error('文件系统操作失败:', fsError);
          console.warn('文件系统API不可用，使用原始URL');
          return imageUrl;
        }
      } else {
        console.warn('文件系统API不可用，使用原始URL');
        return imageUrl;
      }

      // 根据是否使用outputDir返回不同的路径
      if (outputDir) {
        // 对于自定义输出目录，返回完整路径
        return assetPath;
      } else {
        // 对于项目资源，返回相对路径
        return `assets/${filename}`;
      }
    } catch (error) {
      console.error('下载图片失败:', error);
      throw error;
    }
  }

  /**
   * 构建提示词
   * @param {Object} context - 上下文
   * @param {Object} knowledgeBase - 知识库
   * @param {string} userChoice - 用户选择
   */
  async buildPrompt(context, knowledgeBase, userChoice) {
    const project = window.projectManager.getCurrentProject();
    // 读取角色库
    const charactersData = await window.projectManager.readCharacters(project);
    
    // 获取IoT生理数据和分析
    let iotDataSection = '';
    if (window.iotManager) {
      const iotStatus = window.iotManager.getStatus();
      console.log('🎮 获取IoT状态用于AI提示词:', iotStatus);
      
      if (iotStatus.enabled && (iotStatus.heartRate > 0 || iotStatus.sriScore > 0)) {
        iotDataSection = '\n【用户生理与情绪监测】\n';
        
        // 原始数据
        iotDataSection += '原始数据：\n';
        if (iotStatus.heartRate > 0) {
          iotDataSection += `- 实时心率: ${iotStatus.heartRate} BPM`;
          iotDataSection += iotStatus.connected ? ' (实时监测中)\n' : ' (最后记录)\n';
        }
        if (iotStatus.sriScore > 0) {
          iotDataSection += `- SRI性压抑指数: ${iotStatus.sriScore}/100\n`;
        }
        
        // 游戏模式和安全设置
        iotDataSection += '\n游戏设置：\n';
        iotDataSection += `- 游戏模式强度: ${iotStatus.gameMode || '标准模式'}\n`;
        iotDataSection += `- 心率安全目标: ${iotStatus.heartRateTarget || 120} BPM (超过此值应降低刺激)\n`;
        
        // 情绪分析（使用EmotionAnalyzer）
        if (window.emotionAnalyzer && iotStatus.heartRate > 0) {
          const currentEmotion = window.emotionAnalyzer.getCurrentEmotion();
          const emotionSummary = window.emotionAnalyzer.getEmotionSummary();
          const contentSuggestion = window.emotionAnalyzer.getContentSuggestion();
          
          // 添加三个核心指标
          if (currentEmotion) {
            iotDataSection += '\n【核心情绪指标】\n';
            iotDataSection += `- 情绪强度 (Intensity): ${currentEmotion.intensity.toFixed(0)}/100 - ${
              currentEmotion.intensity < 30 ? '低强度,用户状态平稳' :
              currentEmotion.intensity < 60 ? '中等强度,用户有一定情绪波动' :
              '高强度,用户情绪激烈'
            }\n`;
            iotDataSection += `- 唤醒程度 (Arousal): ${currentEmotion.arousal.toFixed(0)}/100 - ${
              currentEmotion.arousal < 40 ? '低唤醒,用户放松平静' :
              currentEmotion.arousal < 70 ? '中等唤醒,用户注意力集中' :
              '高唤醒,用户高度兴奋或紧张'
            }\n`;
            iotDataSection += `- 情绪效价 (Valence): ${currentEmotion.valence.toFixed(0)}/100 - ${
              currentEmotion.valence < -30 ? '负面情绪,用户可能感到不适或紧张' :
              currentEmotion.valence > 30 ? '正面情绪,用户享受当前内容' :
              '中性情绪'
            }\n`;
          }
          
          if (emotionSummary) {
            iotDataSection += '\n详细情绪分析：\n';
            iotDataSection += emotionSummary.split('\n').map(line => `- ${line}`).join('\n') + '\n';
          }
          
          if (contentSuggestion) {
            iotDataSection += `\n💡 内容适配建议: ${contentSuggestion}\n`;
          }
        } else {
          // 回退到简单心率分析
          if (iotStatus.heartRate > 0) {
            iotDataSection += '\n生理状态分析：\n';
            const hr = iotStatus.heartRate;
            let hrAnalysis = '';
            if (hr < 60) {
              hrAnalysis = '心率偏低，用户可能处于放松或平静状态';
            } else if (hr >= 60 && hr <= 80) {
              hrAnalysis = '心率正常，用户处于平稳状态';
            } else if (hr > 80 && hr <= 100) {
              hrAnalysis = '心率略高，用户可能有轻微兴奋或紧张';
            } else if (hr > 100 && hr <= 120) {
              hrAnalysis = '心率明显升高，用户处于兴奋或激动状态';
            } else {
              hrAnalysis = '心率很高，用户情绪激动或身体活跃';
            }
            iotDataSection += `- 心率状态: ${hrAnalysis}\n`;
          }
        }
        
        // IoT Manager的情绪分析数据(情绪状态、兴奋度、紧张度、参与度)
        if (window.iotManager && iotStatus.heartRate > 0) {
          const emotionalState = window.iotManager.analyzeEmotionalState();
          if (emotionalState) {
            iotDataSection += '\n【IoT实时情绪监测】\n';
            iotDataSection += `- 情绪状态: ${window.iotManager.translateEmotionalState(emotionalState.state)}\n`;
            iotDataSection += `- 兴奋度: ${emotionalState.excitement}/100 - ${
              emotionalState.excitement < 30 ? '低兴奋,用户状态平淡' :
              emotionalState.excitement < 60 ? '中等兴奋,用户有一定热情' :
              '高兴奋,用户情绪高涨'
            }\n`;
            iotDataSection += `- 紧张度: ${emotionalState.tension}/100 - ${
              emotionalState.tension < 30 ? '低紧张,用户放松' :
              emotionalState.tension < 60 ? '中等紧张,用户略有压力' :
              '高紧张,用户压力较大'
            }\n`;
            iotDataSection += `- 参与度: ${emotionalState.engagement}/100 - ${
              emotionalState.engagement < 30 ? '低参与,用户可能感到无聊' :
              emotionalState.engagement < 60 ? '中等参与,用户保持关注' :
              '高参与,用户高度投入'
            }\n`;
            
            // 心率趋势
            const trend = window.iotManager.getHeartRateTrend();
            if (trend) {
              iotDataSection += `- 心率趋势: ${window.iotManager.translateTrend(trend.trend)}\n`;
              iotDataSection += `- 平均心率: ${trend.avgRate || '--'} BPM\n`;
              iotDataSection += `- 心率范围: ${trend.minRate || '--'} - ${trend.maxRate || '--'} BPM\n`;
            }
          }
        }
        
        // SRI分析
        if (iotStatus.sriScore > 0) {
          const sri = iotStatus.sriScore;
          let sriAnalysis = '';
          let contentSuggestion = '';
          
          if (sri < 30) {
            sriAnalysis = '性压抑程度很低，用户对性话题持开放态度';
            contentSuggestion = '可以适度使用浪漫、暧昧的情节，用户接受度高';
          } else if (sri >= 30 && sri < 50) {
            sriAnalysis = '性压抑程度较低，用户对性话题比较开放';
            contentSuggestion = '可以使用含蓄的浪漫元素，避免过于直接';
          } else if (sri >= 50 && sri < 70) {
            sriAnalysis = '性压抑程度中等，用户对性话题有一定保留';
            contentSuggestion = '建议使用委婉、含蓄的表达，注重情感铺垫';
          } else if (sri >= 70 && sri < 85) {
            sriAnalysis = '性压抑程度较高，用户对性话题比较敏感';
            contentSuggestion = '应避免直接的性相关内容，重点放在情感和剧情发展上';
          } else {
            sriAnalysis = '性压抑程度很高，用户对性话题非常保守';
            contentSuggestion = '完全避免性相关暗示，专注于纯粹的情感和友谊叙事';
          }
          
          iotDataSection += `\nSRI评估：\n`;
          iotDataSection += `- ${sriAnalysis}\n`;
          iotDataSection += `- 内容建议: ${contentSuggestion}\n`;
        }
        
        // 综合状态评估
        if (iotStatus.heartRate > 0 && iotStatus.sriScore > 0) {
          const hr = iotStatus.heartRate;
          const sri = iotStatus.sriScore;
          let combinedAnalysis = '';
          
          if (hr > 100 && sri < 50) {
            combinedAnalysis = '用户情绪高涨且开放，适合推进浪漫剧情';
          } else if (hr > 100 && sri >= 50) {
            combinedAnalysis = '用户情绪激动但对亲密话题保守，建议聚焦紧张刺激的非性向剧情';
          } else if (hr <= 80 && sri < 50) {
            combinedAnalysis = '用户状态平稳且开放，可以自然地发展各类情节';
          } else if (hr <= 80 && sri >= 70) {
            combinedAnalysis = '用户平静且保守，适合温和、纯情的故事线';
          } else {
            combinedAnalysis = '用户处于中等状态，保持现有内容风格即可';
          }
          
          iotDataSection += `\n综合评估: ${combinedAnalysis}\n`;
        }
        
        // 安全提醒
        if (iotStatus.heartRate > iotStatus.heartRateTarget) {
          iotDataSection += `\n⚠️ 安全警告: 用户心率 (${iotStatus.heartRate} BPM) 已超过安全目标 (${iotStatus.heartRateTarget} BPM)，请立即降低内容刺激程度，提供平和、舒缓的情节。\n`;
        }
        
        iotDataSection += '\n请根据以上生理数据、情绪分析和游戏设置，精准调整故事内容的刺激程度、浪漫尺度和情节节奏。\n';
      }
    }
    
    // 获取前三次对话历史
    let conversationHistory = '';
    try {
      const timeline = await window.projectManager.getTimelineHistory(project.id);
      if (timeline && timeline.length > 0) {
        // 取最后3次对话记录（不包括当前正在生成的）
        const recentHistory = timeline.slice(-3);
        if (recentHistory.length > 0) {
          conversationHistory = '\n历史对话记录（最近3次）：\n';
          recentHistory.forEach((entry, index) => {
            conversationHistory += `\n第 ${recentHistory.length - index} 次对话：\n`;
            if (entry.content) {
              if (entry.content.dialogue) {
                conversationHistory += `对话: ${entry.content.dialogue}\n`;
              }
              if (entry.content.speaker) {
                conversationHistory += `说话者: ${entry.content.speaker}\n`;
              }
              if (entry.userChoice) {
                conversationHistory += `用户选择: ${entry.userChoice}\n`;
              }
              if (entry.content.chapterSummary) {
                conversationHistory += `情节概要: ${entry.content.chapterSummary}\n`;
              }
            }
          });
          conversationHistory += '\n';
        }
      }
    } catch (error) {
      console.warn('获取对话历史失败:', error);
      conversationHistory = '';
    }
    
    let prompt = `你是一个专业的交互式视觉小说作家。请根据以下信息继续故事发展。

项目信息：
- 名称：${project.name}
- 风格：${project.style || '不限'}
- 故事大纲：${project.summary || '待发展'}

知识库信息：
${JSON.stringify(knowledgeBase, null, 2)}

角色库：
${JSON.stringify(charactersData, null, 2)}${conversationHistory}
当前情节：
${context.currentContent || '故事开始'}

${userChoice ? `用户选择：${userChoice}` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ 重要提醒：以下是【用户实时生理监测数据】，与游戏设定无关！
这些数据仅用于调整内容刺激程度和节奏，请勿将其混入故事情节！
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${iotDataSection}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

请严格仅以JSON格式返回以下内容（不要包含任何解释或多余文本）：
{
  "dialogue": "对话内容（必填）",
  "speaker": "当前说话者（可选，若有）",
  "choices": [
    {"id": 1, "text": "选择项1", "action": "continue"},
    {"id": 2, "text": "选择项2", "action": "continue"}
  ],
  "imagePrompt": "图像生成提示词（必填）",
  "knowledgeUpdates": {
    "characters.角色名": "角色信息更新",
    "locations.地点名": "地点信息更新",
    "events.事件名": "事件信息"
  },
  "chapterSummary": "本章节大意（必填）",
  "charactersDelta": [
    {
      "match": {"id": "角色ID或留空", "name": "角色名或留空"},
      "op": "create|update|append-event",
      "data": {
        "id": "新建时建议提供稳定ID，可用英文/拼音",
        "name": "角色名",
        "summary": "角色简介",
        "tags": ["标签1","标签2"],
        "metadata": {"年龄": "17", "身份": "学生"},
        "event": {"title": "事件标题", "desc": "事件描述"}
      }
    }
  ]
}

要求：
1. 对话内容要生动有趣，符合项目风格，并与历史对话保持连贯性
2. 提供2-4个有意义的选择项
3. 图像提示词要详细，包含场景、人物、氛围描述
4. 知识库更新要相关且有用
5. 章节大意要简洁准确
6. 确保JSON格式正确，所有必填字段都存在；不得返回不完整JSON；
7. charactersDelta仅在有角色相关改动时返回，避免无意义空数组
${iotDataSection ? '8. ⚠️ 生理监测数据仅用于控制内容刺激度（根据用户生理数据调整内容的刺激程度、浪漫尺度和情节节奏），不要在故事中提及用户的心率或SRI数据' : ''}`;

  return prompt;
  }

  /**
   * 调用文本生成API
   * @param {string} prompt - 提示词
   */
  async callTextAPI(prompt, signal = null) {
    const headers = {
      'Content-Type': 'application/json'
    };

    let requestBody;
    let endpoint;

    // 根据API类型构建请求
    switch (this.textConfig.type) {
      case 'openai':
        headers['Authorization'] = `Bearer ${this.textConfig.apiKey}`;
        endpoint = `${this.textConfig.url}/chat/completions`;
        requestBody = {
          model: this.textConfig.model,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.8,
          max_tokens: 2000
        };
        break;

      case 'ollama':
        endpoint = `${this.textConfig.url}/api/generate`;
        requestBody = {
          model: this.textConfig.model,
          prompt: prompt,
          stream: false,
          options: {
            temperature: 0.8,
            num_predict: 2000
          }
        };
        break;

      case 'llamacpp':
        endpoint = `${this.textConfig.url}/completion`;
        requestBody = {
          prompt: prompt,
          temperature: 0.8,
          n_predict: 2000,
          stream: false
        };
        break;

      case 'custom':
        headers['Authorization'] = `Bearer ${this.textConfig.apiKey}`;
        endpoint = `${this.textConfig.url}/chat/completions`;
        requestBody = {
          model: this.textConfig.model,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.8,
          max_tokens: 2000
        };
        break;

      default:
        throw new Error('不支持的文本API类型');
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal // 传递中断信号
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`API调用失败: ${response.status} - ${errorData}`);
    }

    const data = await response.json();
    
    // 根据API类型提取响应内容
    let content;
    switch (this.textConfig.type) {
      case 'openai':
      case 'custom':
        content = data.choices[0]?.message?.content;
        break;
      case 'ollama':
        content = data.response;
        break;
      case 'llamacpp':
        content = data.content;
        break;
    }

    if (!content) {
      throw new Error('API响应中没有内容');
    }

    return content;
  }

  /**
   * 调用图像生成API
   * @param {string} prompt - 图像描述
   * @param {Function} onProgress - 进度回调
   * @param {AbortSignal} signal - 中断信号
   */
  async callImageAPI(prompt, onProgress, signal = null) {
    const headers = {
      'Content-Type': 'application/json'
    };

    let requestBody;
    let endpoint;

    // 获取图像分辨率
    let size = '1024x1024';
    if (this.imageConfig.resolution === 'auto') {
      const windowSize = await window.electronAPI.window.getSize();
      const ratio = windowSize[0] / windowSize[1];
      
      if (ratio > 1.5) {
        size = '1792x1024';
      } else if (ratio < 0.7) {
        size = '1024x1792';
      } else {
        size = '1024x1024';
      }
    } else {
      size = this.imageConfig.resolution;
    }

    switch (this.imageConfig.type) {
      case 'openai':
        headers['Authorization'] = `Bearer ${this.imageConfig.apiKey}`;
        endpoint = `${this.imageConfig.url}/images/generations`;
        requestBody = {
          model: this.imageConfig.model,
          prompt: prompt,
          n: 1,
          size: size,
          quality: 'standard',
          response_format: 'url'
        };
        break;

      case 'custom':
        headers['Authorization'] = `Bearer ${this.imageConfig.apiKey}`;
        endpoint = `${this.imageConfig.url}/images/generations`;
        requestBody = {
          model: this.imageConfig.model,
          prompt: prompt,
          n: 1,
          size: size,
          response_format: 'url'
        };
        break;

      default:
        throw new Error('不支持的图像API类型');
    }

    // 进度：开始请求
    if (typeof onProgress === 'function') onProgress({ stage: '开始请求', percent: 5 });

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal // 传递中断信号
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`图像API调用失败: ${response.status} - ${errorData}`);
    }

    const data = await response.json();

    // 对接厂商任务制：若返回task/id/status，则轮询任务进度
    const taskId = data.task_id || data.id;
    const hasTask = taskId && (data.status || data.state || data.progress !== undefined);

    if (this.imageConfig.type === 'custom' && hasTask) {
      // 尝试构造任务查询端点：<base>/images/tasks/{id} 或 <base>/tasks/{id}
      const base = this.imageConfig.url.replace(/\/$/, '');
      const candidates = [
        `${base}/images/tasks/${taskId}`,
        `${base}/tasks/${taskId}`,
        `${base}/image/tasks/${taskId}`
      ];

      let finalUrl = null;
      let lastProgress = 10;
      if (typeof onProgress === 'function') onProgress({ stage: '已排队', percent: lastProgress });

      // 轮询最多60次（~60秒）
      for (let i = 0; i < 60; i++) {
        // 检查中断信号
        if (signal?.aborted) {
          throw new DOMException('Request was aborted', 'AbortError');
        }
        
        // 适度增长进度条，避免卡住（若响应中有progress则使用）
        await Utils.sleep(1000);
        try {
          const statusRes = await fetch(candidates[0], { 
            headers: { 'Authorization': `Bearer ${this.imageConfig.apiKey}` },
            signal 
          });
          const statusData = statusRes.ok ? await statusRes.json() : null;
          const status = statusData?.status || statusData?.state || '';
          const progress = typeof statusData?.progress === 'number' ? Math.max(lastProgress, Math.min(99, Math.round(statusData.progress))) : Math.min(95, lastProgress + 2);
          lastProgress = progress;
          if (typeof onProgress === 'function') onProgress({ stage: status || '生成中', percent: progress });

          // 解析输出URL
          const outputs = statusData?.output || statusData?.data || statusData?.result || [];
          const urlCandidate = Array.isArray(outputs) ? (outputs[0]?.url || outputs[0]) : (outputs?.url || null);
          if (status === 'succeeded' || status === 'success' || status === 'completed' || urlCandidate) {
            finalUrl = urlCandidate;
            break;
          }
        } catch (error) {
          // 如果是中断错误，直接抛出
          if (error.name === 'AbortError') {
            throw error;
          }
          // 忽略其他轮询错误，继续尝试
        }
      }

      if (finalUrl) {
        if (typeof onProgress === 'function') onProgress({ stage: '完成', percent: 100 });
        return finalUrl;
      }

      throw new Error('任务未在超时时间内完成');
    }

    // OpenAI兼容：直接返回url
    const url = data?.data?.[0]?.url || data?.output?.[0]?.url || data?.url;
    if (!url) {
      throw new Error('图像API响应中没有图像URL');
    }
    if (typeof onProgress === 'function') onProgress({ stage: '完成', percent: 100 });
    return url;
  }

  /**
   * 解析AI响应
   * @param {string} response - AI响应文本
   */
  parseAIResponse(response) {
    try {
      // 尝试直接解析JSON
      return JSON.parse(response);
    } catch (error) {
      // 如果直接解析失败，尝试提取JSON部分
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch (innerError) {
          console.warn('JSON提取失败:', innerError);
        }
      }
      
      // 如果还是失败，尝试修复常见的JSON错误
      let fixedResponse = response
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .replace(/,(\s*[}\]])/g, '$1') // 移除末尾多余逗号
        .replace(/([{,]\s*)(\w+):/g, '$1"$2":'); // 给属性名添加引号

      try {
        return JSON.parse(fixedResponse);
      } catch (finalError) {
        throw new Error('无法解析AI响应为有效JSON');
      }
    }
  }

  /**
   * 验证AI响应格式
   * @param {Object} response - 解析后的响应
   */
  validateResponse(response) {
    if (!response || typeof response !== 'object') {
      return false;
    }

    // 检查必填字段
    if (!response.dialogue || typeof response.dialogue !== 'string') {
      return false;
    }

    if (!response.chapterSummary || typeof response.chapterSummary !== 'string') {
      return false;
    }

    if (!response.imagePrompt || typeof response.imagePrompt !== 'string') {
      return false;
    }

  if (!response.choices || !Array.isArray(response.choices) || response.choices.length === 0) {
      return false;
    }

    // 验证选择项格式
    for (const choice of response.choices) {
      if (!choice.text || !choice.id) {
        return false;
      }
    }

    return true;
  }

  /**
   * 应用角色库更新
   * @param {Object} charactersData 原characters.json对象 {characters:{}}
   * @param {Array} delta charactersDelta数组
   * @returns {Object} 新characters对象
   */
  applyCharacterUpdates(charactersData, delta) {
    if (!delta || !Array.isArray(delta)) return charactersData;
    const out = Utils.deepClone(charactersData || { characters: {} });
    if (!out.characters) out.characters = {};
    for (const op of delta) {
      const match = op?.match || {};
      // 查找目标
      let targetId = null;
      if (match.id && out.characters[match.id]) {
        targetId = match.id;
      } else if (match.name) {
        const found = Object.entries(out.characters).find(([id, c]) => c.name === match.name);
        if (found) targetId = found[0];
      }

      if (op.op === 'create') {
        const id = op.data?.id || Utils.generateId();
        if (!out.characters[id]) {
          out.characters[id] = {
            id,
            name: op.data?.name || (match.name || id),
            summary: op.data?.summary || '',
            tags: Array.isArray(op.data?.tags) ? op.data.tags : [],
            metadata: op.data?.metadata || {},
            events: []
          };
        }
        targetId = id;
      }

      if (!targetId) continue;
      const char = out.characters[targetId] || { id: targetId, name: match.name || targetId, tags: [], metadata: {}, events: [] };

      if (op.op === 'update') {
        if (op.data?.name) char.name = op.data.name;
        if (op.data?.summary) char.summary = op.data.summary;
        if (Array.isArray(op.data?.tags)) char.tags = op.data.tags;
        if (op.data?.metadata && typeof op.data.metadata === 'object') {
          char.metadata = { ...(char.metadata||{}), ...op.data.metadata };
        }
      } else if (op.op === 'append-event' && op.data?.event) {
        const ev = op.data.event;
        char.events = char.events || [];
        char.events.push({
          timestamp: Date.now(),
          title: ev.title || '事件',
          desc: ev.desc || ''
        });
      }

      out.characters[targetId] = char;
    }
    return out;
  }

  /**
   * 测试文本API连接
   */
  async testTextAPI() {
    if (!this.textConfig.apiKey) {
      throw new Error('请先配置API Key');
    }

    try {
      const testPrompt = '请简单回复"连接测试成功"';
      const response = await this.callTextAPI(testPrompt);
      
      if (response && response.length > 0) {
        return { success: true, message: '文本API连接成功！', response };
      } else {
        throw new Error('API响应为空');
      }
    } catch (error) {
      return { 
        success: false, 
        message: `文本API连接失败: ${error.message}`,
        error: error.message 
      };
    }
  }

  /**
   * 测试图像API连接
   */
  async testImageAPI() {
    if (!this.imageConfig.apiKey) {
      throw new Error('请先配置API Key');
    }

    try {
      const testPrompt = 'a simple test image';
      const imageUrl = await this.callImageAPI(testPrompt);
      
      if (imageUrl) {
        return { success: true, message: '图像API连接成功！', imageUrl };
      } else {
        throw new Error('API返回的图像URL为空');
      }
    } catch (error) {
      return { 
        success: false, 
        message: `图像API连接失败: ${error.message}`,
        error: error.message 
      };
    }
  }

  /**
   * 获取当前配置状态
   */
  getConfigStatus() {
    return {
      textConfigured: !!(this.textConfig && this.textConfig.apiKey),
      imageConfigured: !!(this.imageConfig && this.imageConfig.apiKey),
      isGenerating: this.isGenerating
    };
  }

  /**
   * 应用知识库更新
   * @param {Object} currentKB - 当前知识库
   * @param {Object} updates - 更新数据
   */
  applyKnowledgeUpdates(currentKB, updates) {
    if (!updates || typeof updates !== 'object') {
      return currentKB;
    }

    const updatedKB = Utils.deepClone(currentKB);

    for (const [path, value] of Object.entries(updates)) {
      if (typeof path !== 'string') continue;

      const pathParts = path.split('.');
      let current = updatedKB;

      // 创建嵌套结构
      for (let i = 0; i < pathParts.length - 1; i++) {
        const part = pathParts[i];
        if (!(part in current) || typeof current[part] !== 'object') {
          current[part] = {};
        }
        current = current[part];
      }

      // 设置最终值
      const finalKey = pathParts[pathParts.length - 1];
      current[finalKey] = value;
    }

    return updatedKB;
  }
}

// 创建全局AI服务实例
window.aiService = new AIService();

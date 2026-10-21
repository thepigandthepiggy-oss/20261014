// ============================================================
// p5.js 響應式選擇題測驗系統
// 題庫由 questions.csv 載入
// CSV 欄位：question, option1, option2, option3, option4, (answer 可省略)
// 沒有 answer 欄時，option1 視為正確答案，抽題時會自動打亂選項順序
// 每次測驗會從題庫中隨機抽出 5 題
// ============================================================


// ============================================================
// 顏色設定
// ============================================================

const BACKGROUND_COLOR = "#f2e9e4";   // 畫布背景
const QUESTION_BOX_COLOR = "#cae9ff"; // 題目框背景
const OPTION_COLOR = "#ffffff";       // 一般選項背景
const CORRECT_COLOR = "#b9fbc0";      // 答對背景
const WRONG_COLOR = "#ffd6ff";        // 答錯背景
const TEXT_COLOR = "#3d405b";         // 文字顏色


// ============================================================
// 測驗設定
// ============================================================

const QUIZ_LENGTH = 5;                // 每次測驗題數
const OPTIONS_PER_QUESTION = 4;       // 每題選項數
const MAIN_FONT = "LXGW WenKai TC";   // 主要字型

// ------------------------------------------------------------
// 題庫來源設定
// ------------------------------------------------------------

// Google 試算表連結，可以貼下列兩種之一：
//   1. 一般分享連結（需設定為「知道連結的任何人都能檢視」）
//   2. 「發佈到網路」取得的 CSV 網址（...pub?output=csv）
// 留空字串 "" 代表只使用本機的 questions.csv
const GOOGLE_SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1GQjpleYijyT7q5M1DdP8eCMv-iunO0Qa/edit?usp=drive_link&ouid=111469468947000363540&rtpof=true&sd=true";

// 使用一般分享連結時，要讀取的工作表名稱
const SHEET_TAB_NAME = "questions";

// 把使用者貼的連結轉成可讀取的 CSV 網址
function buildSheetCsvUrl(inputUrl) {
  const url = inputUrl.trim();

  // 已經是發佈網址或 CSV 輸出網址：直接使用
  if (url.includes("/pub") || url.includes("output=csv")) {
    return url;
  }

  // 一般連結：取出試算表 ID，轉成 gviz CSV 網址
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);

  if (match) {
    return (
      "https://docs.google.com/spreadsheets/d/" +
      match[1] +
      "/gviz/tq?tqx=out:csv&sheet=" +
      encodeURIComponent(SHEET_TAB_NAME)
    );
  }

  return url;
}

// 本機備用題庫檔名（Google 試算表讀不到時會自動改用它）
const CSV_FILE = "questions.csv";

// 目前是否正在讀取 Google 試算表
let loadingFromSheet = false;


// ============================================================
// 全域變數
// ============================================================

let canvasElement;            // p5.js 畫布
let questionBank = [];        // CSV 讀入的完整題庫
let quizQuestions = [];       // 本次抽出的題目（選項已打亂）
let csvLoading = false;       // CSV 是否載入中
let csvLoaded = false;        // CSV 是否載入成功
let csvErrorMessage = "";     // 錯誤訊息

let currentQuestion = 0;      // 目前題目索引
let correctAnswers = 0;       // 答對題數
let selectedOption = -1;      // 使用者選的選項
let questionAnswered = false; // 本題是否已作答

// 下一題按鈕
let nextButton = { x: 0, y: 0, width: 180, height: 56 };

// 重新測驗按鈕
let restartButton = { x: 0, y: 0, width: 230, height: 60 };


// ============================================================
// p5.js 初始化
// ============================================================

function setup() {
  canvasElement = createCanvas(windowWidth, windowHeight);

  textFont(MAIN_FONT);
  textAlign(CENTER, CENTER);
  smooth();
  noStroke();

  canvasElement.style("display", "block");
  canvasElement.style("touch-action", "none");

  loadQuestionBank();
}


// ============================================================
// 讀取 CSV 題庫
// ============================================================

function loadQuestionBank() {
  csvLoading = true;
  csvErrorMessage = "";

  let source = CSV_FILE;
  loadingFromSheet = false;

  // 有設定 Google 試算表網址時，優先讀取線上題庫
  if (GOOGLE_SHEET_CSV_URL.trim() !== "") {
    // 加上時間參數，避免瀏覽器使用舊的快取
    const baseUrl = buildSheetCsvUrl(GOOGLE_SHEET_CSV_URL);
    const separator = baseUrl.includes("?") ? "&" : "?";
    source = baseUrl + separator + "t=" + Date.now();
    loadingFromSheet = true;
  }

  // 第一列當作標題列
  loadTable(
    source,
    "csv",
    "header",
    handleQuestionsLoaded,
    handleQuestionsLoadError
  );
}

// 把一列資料整理成 { 欄位名稱(小寫): 內容 }，並去除 BOM 與空白
function getRowMap(row) {
  const map = {};

  for (const key of Object.keys(row.obj)) {
    const cleanKey = key.replace(/^\uFEFF/, "").trim().toLowerCase();
    map[cleanKey] = String(row.obj[key]).trim();
  }

  return map;
}

// 取得第 index 個選項的內容（支援 option1 或 optionA 兩種欄名）
function getOptionText(rowMap, index) {
  const numberKey = "option" + (index + 1);
  const letterKey = "option" + "abcd"[index];

  if (rowMap[numberKey] !== undefined) return rowMap[numberKey];
  if (rowMap[letterKey] !== undefined) return rowMap[letterKey];

  return "";
}

// 解析正確答案索引；回傳 -1 代表格式錯誤
function resolveAnswerIndex(answerRaw, options) {
  // 沒有填答案：預設 option1 是正確答案
  if (answerRaw === "") return 0;

  const upper = answerRaw.toUpperCase();

  // A~D
  if (["A", "B", "C", "D"].includes(upper)) {
    return upper.charCodeAt(0) - "A".charCodeAt(0);
  }

  // 1~4
  if (["1", "2", "3", "4"].includes(upper)) {
    return Number(upper) - 1;
  }

  // OPTION1 ~ OPTION4
  const match = upper.match(/^OPTION([1-4])$/);
  if (match) return Number(match[1]) - 1;

  // 直接填選項文字
  return options.findIndex(option => option === answerRaw);
}

function handleQuestionsLoaded(table) {
  csvLoading = false;

  // 整理欄位名稱後檢查必要欄位
  const cleanColumns = table.columns.map(
    c => c.replace(/^\uFEFF/, "").trim().toLowerCase()
  );

  const missingColumns = [];

  if (!cleanColumns.includes("question")) {
    missingColumns.push("question");
  }

  for (let i = 0; i < OPTIONS_PER_QUESTION; i++) {
    const hasNumber = cleanColumns.includes("option" + (i + 1));
    const hasLetter = cleanColumns.includes("option" + "abcd"[i]);

    if (!hasNumber && !hasLetter) {
      missingColumns.push("option" + (i + 1));
    }
  }

  if (missingColumns.length > 0) {
    csvLoaded = false;
    csvErrorMessage =
      "題庫格式錯誤：缺少欄位 " + missingColumns.join(", ");
    return;
  }

  // 逐列建立題目
  const validQuestions = [];

  for (let rowIndex = 0; rowIndex < table.getRowCount(); rowIndex++) {
    const rowMap = getRowMap(table.getRow(rowIndex));

    const question = rowMap["question"] || "";

    const options = [];
    for (let i = 0; i < OPTIONS_PER_QUESTION; i++) {
      options.push(getOptionText(rowMap, i));
    }

    // 題目與四個選項都要有內容
    const hasAllText =
      question.length > 0 &&
      options.every(option => option.length > 0);

    if (!hasAllText) continue;

    const answer = resolveAnswerIndex(rowMap["answer"] || "", options);

    if (answer < 0 || answer >= OPTIONS_PER_QUESTION) continue;

    validQuestions.push({
      id: rowMap["id"] || String(rowIndex + 1),
      question: question,
      options: options,
      answer: answer
    });
  }

  questionBank = validQuestions;

  if (questionBank.length < QUIZ_LENGTH) {
    csvLoaded = false;
    csvErrorMessage =
      `題庫題數不足：目前只有 ${questionBank.length} 題，至少需要 ${QUIZ_LENGTH} 題。`;
    return;
  }

  preloadCanvasFont();

  csvLoaded = true;
  startNewQuiz();
}

function handleQuestionsLoadError(error) {
  // Google 試算表讀取失敗：改用本機 questions.csv 備援
  if (loadingFromSheet) {
    console.warn("Google 試算表讀取失敗，改用本機 " + CSV_FILE, error);

    loadingFromSheet = false;

    loadTable(
      CSV_FILE,
      "csv",
      "header",
      handleQuestionsLoaded,
      handleQuestionsLoadError
    );

    return;
  }

  csvLoading = false;
  csvLoaded = false;

  csvErrorMessage =
    "題庫讀取失敗：Google 試算表與本機 " + CSV_FILE + " 都無法讀取。";

  console.error("題庫載入失敗", error);
}

// 要求瀏覽器載入題庫用到的字元字型
// （Google Fonts 中文字型是分段載入，canvas 文字不會自動觸發）
function preloadCanvasFont() {
  try {
    const allText =
      questionBank
        .map(q => q.question + q.options.join(""))
        .join("") +
      "第題共查看成績下一題測驗完成答對總分重新再接再厲太厲害全部不錯繼續練習熟悉指令ABCD0123456789題庫正在載入請稍候無法使用";

    document.fonts.load(`16px "${MAIN_FONT}"`, allText);
    document.fonts.load(`bold 16px "${MAIN_FONT}"`, allText);
  } catch (error) {
    console.warn("字型預先載入失敗", error);
  }
}


// ============================================================
// 隨機抽題與打亂選項
// ============================================================

// 打亂一題的選項順序，並重新計算正確答案位置
function buildQuizQuestion(item) {
  const indexedOptions = item.options.map((text, i) => ({
    text: text,
    isCorrect: i === item.answer
  }));

  // 第二個參數 true 代表直接打亂這個陣列
  shuffle(indexedOptions, true);

  return {
    id: item.id,
    question: item.question,
    options: indexedOptions.map(option => option.text),
    answer: indexedOptions.findIndex(option => option.isCorrect)
  };
}

function startNewQuiz() {
  if (questionBank.length < QUIZ_LENGTH) return;

  // 複製題庫後洗牌，取前 QUIZ_LENGTH 題
  const picked = shuffle(questionBank.slice(), true)
    .slice(0, QUIZ_LENGTH);

  // 每題的選項再各自打亂
  quizQuestions = picked.map(buildQuizQuestion);

  currentQuestion = 0;
  correctAnswers = 0;
  selectedOption = -1;
  questionAnswered = false;
}

function restartQuiz() {
  startNewQuiz();
}

function goToNextQuestion() {
  currentQuestion++;
  questionAnswered = false;
  selectedOption = -1;
}


// ============================================================
// p5.js 主要繪圖
// ============================================================

function draw() {
  background(BACKGROUND_COLOR);

  if (!csvLoaded && csvLoading) {
    drawStatusScreen(
      "正在載入題庫……",
      "請稍候，正在讀取 " + CSV_FILE
    );
    return;
  }

  if (!csvLoaded) {
    drawStatusScreen(
      "題庫無法使用",
      csvErrorMessage ||
        "請確認 " + CSV_FILE + " 是否存在且格式正確。"
    );
    return;
  }

  if (currentQuestion >= quizQuestions.length) {
    drawResultScreen();
    return;
  }

  drawQuizScreen();
}


// ============================================================
// 載入狀態與錯誤畫面
// ============================================================

function drawStatusScreen(title, message) {
  fill(TEXT_COLOR);
  textStyle(NORMAL);

  textSize(getResponsiveTextSize(24, 44, 0.075));
  text(title, width / 2, height * 0.4);

  textSize(getResponsiveTextSize(16, 24, 0.04));

  const messageLines = wrapTextByCharacter(
    message,
    min(width * 0.82, 760)
  );

  const lineStep = getResponsiveTextSize(20, 30, 0.045);

  for (let i = 0; i < messageLines.length; i++) {
    text(messageLines[i], width / 2, height * 0.5 + i * lineStep);
  }
}


// ============================================================
// 響應式尺寸設定
// ============================================================

function getShortSide() {
  return min(width, height);
}

function getSafeMargin() {
  return constrain(getShortSide() * 0.035, 14, 42);
}

function getContentWidth() {
  return min(width - getSafeMargin() * 2, 900);
}

function isLandscape() {
  return width > height;
}

function getQuestionBoxHeight() {
  let boxHeight = getContentWidth() * 0.18;

  // 直向窄畫面：題目框加高
  if (width < 650 && !isLandscape()) {
    boxHeight = getContentWidth() * 0.28;
  }

  // 橫向畫面：限制題目框高度
  if (isLandscape()) {
    boxHeight = min(boxHeight, height * 0.22);
  }

  return constrain(boxHeight, 110, 220);
}

function getOptionHeight() {
  return constrain(getShortSide() * 0.085, 44, 70);
}

function getOptionGap() {
  return constrain(getShortSide() * 0.018, 8, 18);
}

function getQuestionOptionGap() {
  return constrain(getShortSide() * 0.035, 18, 38);
}

function getResponsiveTextSize(minSize, maxSize, ratio) {
  return constrain(getShortSide() * ratio, minSize, maxSize);
}

function getQuizLayout() {
  const contentWidth = getContentWidth();
  const contentX = width / 2 - contentWidth / 2;

  const questionBoxHeight = getQuestionBoxHeight();
  const optionHeight = getOptionHeight();
  const optionGap = getOptionGap();
  const questionOptionGap = getQuestionOptionGap();

  const optionsTotalHeight =
    OPTIONS_PER_QUESTION * optionHeight +
    (OPTIONS_PER_QUESTION - 1) * optionGap;

  // 頂部預留給題數文字
  const topReservedSpace = constrain(height * 0.08, 54, 88);

  const originalQuizHeight =
    questionBoxHeight + questionOptionGap + optionsTotalHeight;

  const availableHeight = height - topReservedSpace - 14;

  // 螢幕太矮時整體等比縮小
  const fitScale = min(1, availableHeight / originalQuizHeight);

  const scaledQuestionBoxHeight = questionBoxHeight * fitScale;
  const scaledOptionHeight = optionHeight * fitScale;
  const scaledOptionGap = optionGap * fitScale;
  const scaledQuestionOptionGap = questionOptionGap * fitScale;

  const scaledOptionsTotalHeight =
    OPTIONS_PER_QUESTION * scaledOptionHeight +
    (OPTIONS_PER_QUESTION - 1) * scaledOptionGap;

  const scaledQuizHeight =
    scaledQuestionBoxHeight +
    scaledQuestionOptionGap +
    scaledOptionsTotalHeight;

  // 整組內容垂直置中
  const questionBoxY =
    topReservedSpace +
    max(0, (height - topReservedSpace - scaledQuizHeight) / 2);

  const optionsStartY =
    questionBoxY +
    scaledQuestionBoxHeight +
    scaledQuestionOptionGap;

  return {
    contentX: contentX,
    contentWidth: contentWidth,
    questionBoxY: questionBoxY,
    questionBoxHeight: scaledQuestionBoxHeight,
    optionHeight: scaledOptionHeight,
    optionGap: scaledOptionGap,
    optionsStartY: optionsStartY,
    optionsTotalHeight: scaledOptionsTotalHeight,
    fitScale: fitScale
  };
}


// ============================================================
// 繪製測驗畫面
// ============================================================

function drawQuizScreen() {
  const questionData = quizQuestions[currentQuestion];
  const layout = getQuizLayout();

  drawQuestionCounter();
  drawQuestionBox(questionData.question, layout);
  drawOptions(questionData, layout);

  if (questionAnswered) {
    drawNextButton(layout);
  }
}

function drawQuestionCounter() {
  fill(TEXT_COLOR);
  textStyle(NORMAL);
  textSize(getResponsiveTextSize(16, 26, 0.045));

  text(
    `第 ${currentQuestion + 1} 題 / 共 ${QUIZ_LENGTH} 題`,
    width / 2,
    constrain(height * 0.045, 26, 44)
  );
}


// ============================================================
// 題目框與題目文字
// ============================================================

function drawQuestionBox(questionText, layout) {
  fill(QUESTION_BOX_COLOR);

  rect(
    layout.contentX,
    layout.questionBoxY,
    layout.contentWidth,
    layout.questionBoxHeight,
    20
  );

  fill(TEXT_COLOR);
  textStyle(BOLD);

  const maxTextWidth = layout.contentWidth * 0.82;
  const maxTextHeight = layout.questionBoxHeight * 0.74;

  const maxFontSize = constrain(
    getShortSide() * 0.06 * layout.fitScale,
    18,
    34
  );

  const textLayout = getFittedQuestionText(
    questionText,
    maxTextWidth,
    maxTextHeight,
    maxFontSize,
    11
  );

  textSize(textLayout.fontSize);

  const lineHeight = textLayout.fontSize * 1.25;
  const totalTextHeight = textLayout.lines.length * lineHeight;

  const firstLineY =
    layout.questionBoxY +
    layout.questionBoxHeight / 2 -
    totalTextHeight / 2 +
    lineHeight / 2;

  for (let i = 0; i < textLayout.lines.length; i++) {
    text(textLayout.lines[i], width / 2, firstLineY + i * lineHeight);
  }

  textStyle(NORMAL);
}

// 由大到小嘗試字體，找出能放進題目框的大小
function getFittedQuestionText(
  questionText,
  maxWidth,
  maxHeight,
  startingFontSize,
  minimumFontSize
) {
  for (
    let fontSize = startingFontSize;
    fontSize >= minimumFontSize;
    fontSize--
  ) {
    textSize(fontSize);

    const lines = wrapTextByCharacter(questionText, maxWidth);
    const totalHeight = lines.length * fontSize * 1.25;

    const widestLine = lines.reduce(
      (widest, line) => max(widest, textWidth(line)),
      0
    );

    if (widestLine <= maxWidth && totalHeight <= maxHeight) {
      return { lines: lines, fontSize: fontSize };
    }
  }

  textSize(minimumFontSize);

  return {
    lines: wrapTextByCharacter(questionText, maxWidth),
    fontSize: minimumFontSize
  };
}

// 逐字換行（適合中文，也能處理英文長字串）
function wrapTextByCharacter(textString, maxWidth) {
  const characters = Array.from(String(textString));
  const lines = [];
  let currentLine = "";

  for (const character of characters) {
    if (character === "\n") {
      lines.push(currentLine);
      currentLine = "";
      continue;
    }

    const testLine = currentLine + character;

    if (textWidth(testLine) <= maxWidth || currentLine.length === 0) {
      currentLine = testLine;
    } else {
      lines.push(currentLine);
      currentLine = character;
    }
  }

  if (currentLine.length > 0 || lines.length === 0) {
    lines.push(currentLine);
  }

  return lines;
}


// ============================================================
// 答案選項
// ============================================================

function drawOptions(questionData, layout) {
  for (let i = 0; i < OPTIONS_PER_QUESTION; i++) {
    const optionX = layout.contentX;
    const optionY =
      layout.optionsStartY +
      i * (layout.optionHeight + layout.optionGap);

    const animationOffset = getOptionAnimationOffset(i);
    const animatedX = optionX + animationOffset.x;
    const animatedY = optionY + animationOffset.y;

    const isCorrectOption = i === questionData.answer;
    const isWrongSelectedOption =
      questionAnswered && i === selectedOption && !isCorrectOption;

    if (questionAnswered && isCorrectOption) {
      fill(CORRECT_COLOR);
    } else if (isWrongSelectedOption) {
      fill(WRONG_COLOR);
    } else {
      fill(OPTION_COLOR);
    }

    rect(
      animatedX,
      animatedY,
      layout.contentWidth,
      layout.optionHeight,
      16
    );

    fill(TEXT_COLOR);
    textStyle(NORMAL);

    const optionText =
      `${String.fromCharCode(65 + i)}. ${questionData.options[i]}`;

    const optionFontSize = fitSingleLineFontSize(
      optionText,
      layout.contentWidth * 0.88,
      getResponsiveTextSize(16, 25, 0.045) * layout.fitScale,
      11
    );

    textSize(optionFontSize);

    text(
      optionText,
      animatedX + layout.contentWidth / 2,
      animatedY + layout.optionHeight / 2
    );
  }
}

function fitSingleLineFontSize(
  textString,
  maxWidth,
  startingSize,
  minimumSize
) {
  for (
    let fontSize = floor(startingSize);
    fontSize >= minimumSize;
    fontSize--
  ) {
    textSize(fontSize);

    if (textWidth(textString) <= maxWidth) {
      return fontSize;
    }
  }

  return minimumSize;
}


// ============================================================
// 下一題按鈕
// ============================================================

function drawNextButton(layout) {
  nextButton.width = constrain(width * 0.42, 155, 220);
  nextButton.height = constrain(getShortSide() * 0.09, 46, 64);

  nextButton.x = width / 2 - nextButton.width / 2;
  nextButton.y = layout.optionsStartY + layout.optionsTotalHeight + 18;

  // 避免按鈕超出畫布底部
  if (nextButton.y + nextButton.height > height - 12) {
    nextButton.y = height - nextButton.height - 12;
  }

  fill(OPTION_COLOR);

  rect(
    nextButton.x,
    nextButton.y,
    nextButton.width,
    nextButton.height,
    16
  );

  const buttonText =
    currentQuestion === QUIZ_LENGTH - 1 ? "查看成績" : "下一題";

  fill(TEXT_COLOR);
  textStyle(NORMAL);

  textSize(
    fitSingleLineFontSize(
      buttonText,
      nextButton.width * 0.82,
      getResponsiveTextSize(16, 24, 0.045) * layout.fitScale,
      11
    )
  );

  text(buttonText, width / 2, nextButton.y + nextButton.height / 2);
}


// ============================================================
// 答案動畫
// ============================================================

function getOptionAnimationOffset(optionIndex) {
  if (!questionAnswered) {
    return { x: 0, y: 0 };
  }

  const correctIndex = quizQuestions[currentQuestion].answer;
  const animationTime = millis() * 0.006;

  // 正確答案：上下浮動
  if (optionIndex === correctIndex) {
    return { x: 0, y: sin(animationTime * 2.2) * 8 };
  }

  // 答錯的選項：左右搖晃
  if (optionIndex === selectedOption) {
    return { x: sin(animationTime * 3.2) * 10, y: 0 };
  }

  return { x: 0, y: 0 };
}


// ============================================================
// 滑鼠與觸控操作
// ============================================================

function mousePressed() {
  handlePointerPressed(mouseX, mouseY);
  return false;
}

function touchStarted() {
  if (touches.length > 0) {
    handlePointerPressed(touches[0].x, touches[0].y);
  }

  // 防止手機頁面滑動，也避免同時觸發 mousePressed
  return false;
}

function handlePointerPressed(pointerX, pointerY) {
  // 題庫尚未準備好時不處理
  if (!csvLoaded) return;

  // 測驗結束：只處理重新測驗按鈕
  if (currentQuestion >= quizQuestions.length) {
    if (isPointInsideButton(pointerX, pointerY, restartButton)) {
      restartQuiz();
    }
    return;
  }

  // 已作答：只處理下一題按鈕
  if (questionAnswered) {
    if (isPointInsideButton(pointerX, pointerY, nextButton)) {
      goToNextQuestion();
    }
    return;
  }

  const layout = getQuizLayout();

  for (let i = 0; i < OPTIONS_PER_QUESTION; i++) {
    const optionX = layout.contentX;
    const optionY =
      layout.optionsStartY +
      i * (layout.optionHeight + layout.optionGap);

    const isInsideOption =
      pointerX >= optionX &&
      pointerX <= optionX + layout.contentWidth &&
      pointerY >= optionY &&
      pointerY <= optionY + layout.optionHeight;

    if (isInsideOption) {
      selectedOption = i;
      questionAnswered = true;

      if (selectedOption === quizQuestions[currentQuestion].answer) {
        correctAnswers++;
      }

      return;
    }
  }
}

function isPointInsideButton(pointerX, pointerY, button) {
  return (
    pointerX >= button.x &&
    pointerX <= button.x + button.width &&
    pointerY >= button.y &&
    pointerY <= button.y + button.height
  );
}


// ============================================================
// 成績畫面
// ============================================================

function drawResultScreen() {
  const score = (correctAnswers / QUIZ_LENGTH) * 100;

  fill(TEXT_COLOR);
  textStyle(NORMAL);

  textSize(getResponsiveTextSize(28, 54, 0.085));
  text("測驗完成！", width / 2, height * 0.23);

  textSize(getResponsiveTextSize(20, 40, 0.06));
  text(
    `答對題數：${correctAnswers} / ${QUIZ_LENGTH}`,
    width / 2,
    height * 0.39
  );
  text(`總成績：${score} 分`, width / 2, height * 0.49);

  textSize(getResponsiveTextSize(16, 26, 0.04));

  let message;

  if (score === 100) {
    message = "太厲害了！全部答對！";
  } else if (score >= 60) {
    message = "做得不錯，繼續練習！";
  } else {
    message = "再接再厲，多熟悉 p5.js 指令！";
  }

  text(message, width / 2, height * 0.59);

  // 重新測驗按鈕
  restartButton.width = constrain(width * 0.55, 200, 280);
  restartButton.height = constrain(getShortSide() * 0.09, 50, 68);
  restartButton.x = width / 2 - restartButton.width / 2;
  restartButton.y = height * 0.7;

  if (restartButton.y + restartButton.height > height - 14) {
    restartButton.y = height - restartButton.height - 14;
  }

  fill(OPTION_COLOR);

  rect(
    restartButton.x,
    restartButton.y,
    restartButton.width,
    restartButton.height,
    16
  );

  fill(TEXT_COLOR);

  textSize(
    fitSingleLineFontSize(
      "重新測驗一次",
      restartButton.width * 0.82,
      getResponsiveTextSize(17, 26, 0.045),
      11
    )
  );

  text(
    "重新測驗一次",
    width / 2,
    restartButton.y + restartButton.height / 2
  );
}


// ============================================================
// 視窗尺寸變更
// ============================================================

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

/// <reference types="@figma/plugin-typings" />

// Self-Check Design Assistant Plugin
// 선택된 디자인 요소를 분석하여 사내 디자인 원칙 준수 여부를 확인합니다.

// This file holds the main code for plugins. Code in this file has access to
// the *figma document* via the figma global object.
// You can access browser APIs in the <script> tag inside "ui.html" which has a
// full browser environment (See https://www.figma.com/plugin-docs/how-plugins-run).

// This shows the HTML page in "ui.html".
figma.showUI(__html__, { width: 360, height: 480, themeColors: true });

// 마크다운 코드 블록에서 JSON 추출하는 함수
function extractJsonFromMarkdown(text: string): string {
  // ```json ... ``` 블록 제거
  const jsonBlockRegex = /```json\s*([\s\S]*?)\s*```/;
  const match = text.match(jsonBlockRegex);
  
  if (match) {
    return match[1].trim();
  }
  
  // ```로 시작하는 일반 코드 블록도 확인
  const codeBlockRegex = /```\s*([\s\S]*?)\s*```/;
  const codeMatch = text.match(codeBlockRegex);
  
  if (codeMatch) {
    return codeMatch[1].trim();
  }
  
  // 마크다운 블록이 없으면 원본 텍스트 반환
  return text.trim();
}

// 색상 정보 추출 함수
function extractColor(paint: Paint): string {
  if (paint.type === 'SOLID') {
    const { r, g, b } = paint.color;
    const alpha = paint.opacity || 1;
    return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${alpha})`;
  } else if (paint.type === 'GRADIENT_LINEAR') {
    return `linear-gradient (${paint.gradientStops.length} stops)`;
  } else if (paint.type === 'GRADIENT_RADIAL') {
    return `radial-gradient (${paint.gradientStops.length} stops)`;
  } else if (paint.type === 'IMAGE') {
    return 'image-fill';
  }
  return paint.type.toLowerCase();
}

// 텍스트 스타일 정보 추출 함수
function extractTextStyle(textNode: TextNode): string {
  const styles: string[] = [];
  
  // 폰트 정보
  if (typeof textNode.fontName === 'object' && textNode.fontName !== null) {
    const fontName = textNode.fontName as FontName;
    styles.push(`폰트: ${fontName.family} ${fontName.style}`);
  }
  
  // 폰트 크기
  if (typeof textNode.fontSize === 'number') {
    styles.push(`크기: ${textNode.fontSize}px`);
  }
  
  // 줄 간격
  if (typeof textNode.lineHeight === 'object' && textNode.lineHeight !== null) {
    const lineHeight = textNode.lineHeight as LineHeight;
    if (lineHeight.unit === 'PIXELS') {
      styles.push(`줄간격: ${lineHeight.value}px`);
    } else if (lineHeight.unit === 'PERCENT') {
      styles.push(`줄간격: ${lineHeight.value}%`);
    }
  }
  
  // 텍스트 정렬
  if (typeof textNode.textAlignHorizontal === 'string') {
    styles.push(`정렬: ${textNode.textAlignHorizontal.toLowerCase()}`);
  }
  
  // 텍스트 색상
  if (Array.isArray(textNode.fills)) {
    const fills = textNode.fills as Paint[];
    if (fills.length > 0) {
      styles.push(`색상: ${extractColor(fills[0])}`);
    }
  }
  
  return styles.join(', ');
}

// Auto Layout 정보 추출 함수
function extractAutoLayoutInfo(node: FrameNode): string {
  const layoutInfo: string[] = [];
  
  if (node.layoutMode !== 'NONE') {
    layoutInfo.push(`레이아웃: ${node.layoutMode === 'HORIZONTAL' ? '수평' : '수직'}`);
    layoutInfo.push(`간격: ${node.itemSpacing}px`);
    layoutInfo.push(`패딩: ${node.paddingTop}px ${node.paddingRight}px ${node.paddingBottom}px ${node.paddingLeft}px`);
    layoutInfo.push(`정렬: ${node.primaryAxisAlignItems}, ${node.counterAxisAlignItems}`);
  }
  
  return layoutInfo.join(', ');
}

// 효과 정보 추출 함수
function extractEffects(node: SceneNode): string {
  if (!('effects' in node) || !node.effects || node.effects.length === 0) return '';
  
  const effects = node.effects.map((effect: any) => {
    switch (effect.type) {
      case 'DROP_SHADOW':
        return `드롭 섀도우 (${effect.offset.x}, ${effect.offset.y}, blur: ${effect.radius})`;
      case 'INNER_SHADOW':
        return `내부 섀도우 (${effect.offset.x}, ${effect.offset.y}, blur: ${effect.radius})`;
      case 'LAYER_BLUR':
        return `레이어 블러 (${effect.radius})`;
      case 'BACKGROUND_BLUR':
        return `배경 블러 (${effect.radius})`;
      default:
        return effect.type.toLowerCase();
    }
  });
  
  return effects.join(', ');
}

// 계층 구조 정보 추출 함수
function extractHierarchy(node: SceneNode, depth: number = 0): string {
  const indent = '  '.repeat(depth);
  let hierarchy = `${indent}${node.type}: ${node.name}`;
  
  if ('children' in node && node.children) {
    const children = node.children as SceneNode[];
    if (children.length > 0) {
      hierarchy += `\n${indent}  자식 요소 (${children.length}개):`;
      children.forEach(child => {
        hierarchy += `\n${extractHierarchy(child, depth + 2)}`;
      });
    }
  }
  
  return hierarchy;
}

// 노드의 상세 정보 추출 함수
function extractDetailedNodeInfo(node: SceneNode): string {
  const info: string[] = [];
  
  // 기본 정보
  info.push(`=== ${node.type}: ${node.name} ===`);
  info.push(`크기: ${Math.round(node.width)}×${Math.round(node.height)}px`);
  info.push(`위치: (${Math.round(node.x)}, ${Math.round(node.y)})`);
  
  // 가시성
  if (!node.visible) {
    info.push(`가시성: 숨김`);
  }
  
  // 투명도
  if ('opacity' in node && node.opacity !== 1) {
    info.push(`투명도: ${Math.round(node.opacity * 100)}%`);
  }
  
  // 배경색/채우기 (Rectangle, Frame, Ellipse 등)
  if ('fills' in node && Array.isArray(node.fills)) {
    const fills = node.fills as Paint[];
    if (fills.length > 0) {
      const fillColors = fills.map(fill => extractColor(fill));
      info.push(`배경: ${fillColors.join(', ')}`);
    }
  }
  
  // 테두리
  if ('strokes' in node && Array.isArray(node.strokes)) {
    const strokes = node.strokes as Paint[];
    if (strokes.length > 0 && 'strokeWeight' in node) {
      const strokeColors = strokes.map(stroke => extractColor(stroke));
      info.push(`테두리: ${(node as any).strokeWeight}px ${strokeColors.join(', ')}`);
    }
  }
  
  // 모서리 둥글기
  if ('cornerRadius' in node && typeof (node as any).cornerRadius === 'number' && (node as any).cornerRadius !== 0) {
    info.push(`모서리 둥글기: ${(node as any).cornerRadius}px`);
  }
  
  // 타입별 세부 정보
  if (node.type === 'TEXT') {
    const textNode = node as TextNode;
    info.push(`텍스트 내용: "${textNode.characters}"`);
    info.push(`텍스트 스타일: ${extractTextStyle(textNode)}`);
  }
  
  if (node.type === 'FRAME') {
    const frameNode = node as FrameNode;
    const autoLayoutInfo = extractAutoLayoutInfo(frameNode);
    if (autoLayoutInfo) {
      info.push(`Auto Layout: ${autoLayoutInfo}`);
    }
    
    // 클리핑 마스크
    if (frameNode.clipsContent) {
      info.push(`클리핑: 활성화`);
    }
  }
  
  // 효과
  const effects = extractEffects(node);
  if (effects) {
    info.push(`효과: ${effects}`);
  }
  
  // 제약 조건
  if ('constraints' in node) {
    const constraints = node.constraints as Constraints;
    info.push(`제약조건: 수평(${constraints.horizontal}), 수직(${constraints.vertical})`);
  }
  
  // 자식 요소 정보
  if ('children' in node && node.children) {
    const children = node.children as SceneNode[];
    if (children.length > 0) {
      info.push(`자식 요소: ${children.length}개`);
      children.forEach((child, index) => {
        info.push(`  ${index + 1}. ${child.type}: ${child.name} (${Math.round(child.width)}×${Math.round(child.height)}px)`);
      });
    }
  }
  
  return info.join('\n');
}

// 초기 선택 요소 정보를 UI에 전송
function getSelectionDescription(): string {
  const selection = figma.currentPage.selection;
  
  if (selection.length === 0) {
    return "선택된 요소가 없습니다.";
  }
  
  const descriptions: string[] = [];
  
  // 선택된 요소 개수 및 전체 컨텍스트
  descriptions.push(`📋 선택된 요소: ${selection.length}개`);
  descriptions.push(`📄 페이지: ${figma.currentPage.name}`);
  descriptions.push('');
  
  // 각 선택된 요소의 상세 정보
  selection.forEach((node, index) => {
    descriptions.push(`🔍 요소 ${index + 1}:`);
    descriptions.push(extractDetailedNodeInfo(node));
    descriptions.push('');
  });
  
  // 전체 계층 구조
  if (selection.length === 1) {
    descriptions.push(`🌳 계층 구조:`);
    descriptions.push(extractHierarchy(selection[0]));
    descriptions.push('');
  }
  
  // 디자인 시스템 분석을 위한 추가 컨텍스트
  descriptions.push(`💡 분석 포인트:`);
  descriptions.push(`- 총 ${selection.length}개 요소의 디자인 일관성`);
  descriptions.push(`- 스타일 가이드 준수 여부 (색상, 폰트, 간격)`);
  descriptions.push(`- 레이아웃 구조의 적절성`);
  descriptions.push(`- 사용자 경험 관점에서의 접근성`);
  descriptions.push(`- 반응형 디자인 고려사항`);
  
  return descriptions.join('\n');
}

// 초기 선택 정보 전송
const initialSelection = getSelectionDescription();
figma.ui.postMessage({ 
  type: "SELECTION_INFO", 
  payload: initialSelection 
});

// UI 메시지 처리
figma.ui.onmessage = async (msg: { type: string; [key: string]: any }) => {
  try {
    if (msg.type === "REQUEST_SELECTION") {
      // 현재 선택 정보 재전송
      const currentSelection = getSelectionDescription();
      figma.ui.postMessage({ 
        type: "SELECTION_INFO", 
        payload: currentSelection 
      });
    }
    
    if (msg.type === "RUN_ANALYSIS") {
      // 현재 선택 요소 분석 실행
      const selection = getSelectionDescription();
      
      if (selection === "선택된 요소가 없습니다.") {
        figma.ui.postMessage({ 
          type: "ANALYSIS_ERROR", 
          payload: "분석할 요소를 먼저 선택해주세요." 
        });
        return;
      }
      
      // 로딩 상태 전송
      figma.ui.postMessage({ 
        type: "ANALYSIS_LOADING", 
        payload: true 
      });
      
      try {
        // 먼저 간단한 테스트 요청으로 API 연결 확인
        console.log("🔍 API 연결 테스트 시작");
        
        const testResponse: any = await fetch("https://cloud.flowiseai.com/api/v1/prediction/de3520ea-eb41-428b-ad5c-cc887f03c52f", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            question: "안녕하세요. 간단한 테스트입니다."
          })
        });
        
        console.log("🧪 테스트 응답 상태:", testResponse.status);
        
        if (testResponse.status >= 400) {
          // 에러 응답의 내용도 확인
          const errorText = await testResponse.text();
          console.log("❌ 테스트 에러 응답:", errorText);
          
          figma.ui.postMessage({ 
            type: "ANALYSIS_ERROR", 
            payload: `API 연결 실패 (${testResponse.status}):\n${errorText}\n\n간단한 테스트 요청도 실패했습니다. Flowise 설정을 확인해주세요.` 
          });
          return;
        }
        
        const testResult = await testResponse.text();
        console.log("✅ 테스트 성공:", testResult);
        
        // 테스트 성공 시 실제 분석 요청 진행
        console.log("🔍 실제 분석 요청 시작");
        
        // 디자인 원칙 기반 분석 프롬프트
        const analysisPrompt = `선택된 Figma 디자인 요소를 우리 회사의 12가지 디자인 원칙에 따라 분석해주세요. 각 평가는 반드시 구체적인 근거와 정량적 영향을 포함해야 합니다.

분석 대상:
${selection}

**분석 시 반드시 포함해야 할 요소:**
- 문서의 구체적 수치와 비교 데이터 인용
- 원칙 위반이 비즈니스에 미치는 실제 임팩트 설명
- 문서 사례를 통한 개선 방향 제시
- 사용자가 왜 이 원칙을 놓쳤는지에 대한 인사이트

다음 JSON 형태로만 응답해주세요:
{
  "summary": "전체 평가 요약 (1-2문장, 문서 사례 기반)",
  "violations": [
    {
      "element": "요소명",
      "principle": "위반된원칙",
      "issue": "문제점과문서사례",
      "severity": "심각도",
      "solution": "문서기반해결방안",
      "impact": "예상되는정량적영향"
    }
  ],
  "compliances": [
    {
      "element": "요소명",
      "principle": "준수한원칙",
      "strength": "잘된점과문서사례",
      "impact_level": "임팩트수준",
      "quantitative_effect": "정량적효과"
    }
  ],
  "recommendations": [
    {
      "priority": "우선순위",
      "suggestion": "개선권장사항",
      "expected_effect": "문서기반예상효과",
      "case_result": "유사사례결과"
    }
  ],
  "insights": [
    {
      "principle": "원칙명",
      "missed_reason": "왜놓쳤는지분석",
      "business_impact": "비즈니스임팩트",
      "lesson": "문서사례기반교훈"
    }
  ],
  "score": {
    "overall": "1-100",
    "principles": {
      "Simplicity": "1-10",
      "Casual Concept": "1-10",
      "Minimum Feature": "1-10",
      "Less Policy": "1-10",
      "One Thing per One Page": "1-10",
      "Tap & Scroll": "1-10",
      "Easy to Answer": "1-10",
      "Value First, Cost Later": "1-10",
      "No Ads Patterns": "1-10",
      "Context-based": "1-10",
      "No More Loading": "1-10",
      "Sleek Experience": "1-10"
    }
  }
}

예시:
{
  "violations": [
    {
      "element": "로그인 버튼",
      "principle": "단순함",
      "issue": "한 화면에 너무 많은 요소 배치로 전환율이 14%p 감소 위험",
      "severity": "높음",
      "solution": "핵심 3개 요소만 남기면 전환율 14%p 향상 가능",
      "impact": "전환율 14%p 감소 예상"
    }
  ],
  "insights": [
    {
      "principle": "단순함",
      "missed_reason": "핵심 기능과 부가 기능을 구분하지 않아 모든 것을 노출하려는 욕구",
      "business_impact": "작업 시간을 81% 증가시키고 이탈률을 175% 증가시킴",
      "lesson": "핵심 기능에 집중하여 37% 시간 단축 달성 가능"
    }
  ]
}`;
        
        console.log("📋 분석 프롬프트:", analysisPrompt);
        
        // Flowise 엔드포인트로 실제 분석 요청
        const response: any = await fetch("https://cloud.flowiseai.com/api/v1/prediction/de3520ea-eb41-428b-ad5c-cc887f03c52f", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            question: analysisPrompt
          })
        });
        
        console.log("📡 분석 응답 상태:", response.status);
        
        if (response.status >= 400) {
          // 에러 응답의 내용 확인
          const errorText = await response.text();
          console.log("❌ 분석 에러 응답:", errorText);
          
          figma.ui.postMessage({ 
            type: "ANALYSIS_ERROR", 
            payload: `분석 요청 실패 (${response.status}):\n\n에러 내용:\n${errorText}\n\n프롬프트가 너무 복잡하거나 Flowise 설정에 문제가 있을 수 있습니다.` 
          });
          return;
        }
        
        // 응답 텍스트 먼저 확인
        const responseText = await response.text();
        console.log("📋 분석 원본 응답:", responseText);
        
        let result;
        try {
          // JSON 파싱 시도
          const flowiseResponse = JSON.parse(responseText);
          console.log("✅ Flowise 응답 파싱 성공:", flowiseResponse);
          
          // Flowise 응답에서 실제 분석 결과 추출
          if (flowiseResponse.text) {
            console.log("📄 실제 분석 결과 텍스트:", flowiseResponse.text);
            
            try {
              // 마크다운 코드 블록에서 JSON 추출
              const extractedJson = extractJsonFromMarkdown(flowiseResponse.text);
              console.log("🎯 추출된 JSON:", extractedJson);
              
              // 실제 분석 결과를 JSON으로 파싱
              const analysisResult = JSON.parse(extractedJson);
              console.log("✅ 분석 결과 파싱 성공:", analysisResult);
              
              // violations 필드가 없거나 배열이 아닌 경우 처리
              if (!analysisResult.violations || !Array.isArray(analysisResult.violations)) {
                analysisResult.violations = [];
              }
              
              // compliances 필드가 없거나 배열이 아닌 경우 처리
              if (!analysisResult.compliances || !Array.isArray(analysisResult.compliances)) {
                analysisResult.compliances = [];
              }
              
              // recommendations 필드가 없거나 배열이 아닌 경우 처리
              if (!analysisResult.recommendations || !Array.isArray(analysisResult.recommendations)) {
                analysisResult.recommendations = [];
              }
              
              // insights 필드가 없거나 배열이 아닌 경우 처리
              if (!analysisResult.insights || !Array.isArray(analysisResult.insights)) {
                analysisResult.insights = [];
              }
              
              result = analysisResult;
            } catch (analysisParseError) {
              console.error("❌ 분석 결과 파싱 실패:", analysisParseError);
              // 분석 결과 파싱 실패시 원본 텍스트 사용
              result = {
                raw_analysis: flowiseResponse.text,
                parse_error: "분석 결과 JSON 파싱 실패",
                message: "AI가 반환한 분석 결과를 JSON으로 파싱할 수 없습니다."
              };
            }
          } else {
            // text 필드가 없는 경우
            console.log("⚠️ text 필드가 없음, 전체 응답 사용");
            result = flowiseResponse;
          }
          
        } catch (parseError) {
          console.error("❌ Flowise 응답 파싱 실패:", parseError);
          // JSON 파싱 실패시 원본 텍스트 사용
          const errorMessage = parseError instanceof Error ? parseError.message : String(parseError);
          result = {
            raw_response: responseText,
            parse_error: errorMessage,
            message: "Flowise 응답을 JSON으로 파싱할 수 없습니다."
          };
        }
        
        // 분석 결과 전송
        figma.ui.postMessage({ 
          type: "ANALYSIS_RESULT", 
          payload: result 
        });
        
        console.log("✅ 결과 전송 완료", result);
        
      } catch (error) {
        console.error("💥 전체 에러:", error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // 네트워크 에러 등 상세 정보 제공
        figma.ui.postMessage({ 
          type: "ANALYSIS_ERROR", 
          payload: `연결 실패:\n${errorMessage}\n\n가능한 원인:\n1. 네트워크 연결 문제\n2. Flowise 서버 문제\n3. API 엔드포인트 문제\n4. CORS 정책 문제\n\nFlowise 웹에서 직접 테스트해보시고 서버 상태를 확인해주세요.` 
        });
      } finally {
        // 로딩 상태 해제
        figma.ui.postMessage({ 
          type: "ANALYSIS_LOADING", 
          payload: false 
        });
      }
    }
    
    if (msg.type === "CLOSE_PLUGIN") {
  figma.closePlugin();
    }
    
  } catch (error) {
    console.error("Message handling error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    figma.ui.postMessage({ 
      type: "ANALYSIS_ERROR", 
      payload: `오류가 발생했습니다: ${errorMessage}` 
    });
  }
};

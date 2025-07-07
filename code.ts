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
        const analysisPrompt = `다음 Figma 디자인 요소를 우리 회사의 12가지 디자인 원칙에 따라 분석해주세요:

${selection}

**중요: 모든 응답은 한글로 작성하고, 각 평가에 대해 구체적인 근거와 정량적 영향을 포함해주세요.**

다음 JSON 형태로만 응답해주세요 (마크다운 블록 없이):
{
  "summary": "1-2문장의 전체 평가 요약 (한글)",
  "violations": [
    ["요소명", "원칙명", "문제점", "심각도", "해결방안", "예상되는 정량적 영향"]
  ],
  "compliances": [
    ["요소명", "원칙명", "잘된점", "영향도", "실제 사례 기반 정량적 효과"]
  ],
  "recommendations": [
    ["우선순위", "권장사항", "예상효과", "유사 개선 사례의 정량적 결과"]
  ],
  "score": {
    "overall": 1-100,
    "principles": {
      "Simplicity": 1-10,
      "Casual Concept": 1-10,
      "Minimum Feature": 1-10,
      "Less Policy": 1-10,
      "One Thing per One Page": 1-10,
      "Tap & Scroll": 1-10,
      "Easy to Answer": 1-10,
      "Value First, Cost Later": 1-10,
      "No Ads Patterns": 1-10,
      "Context-based": 1-10,
      "No More Loading": 1-10,
      "Sleek Experience": 1-10
    }
  },
  "insights": {
    "impact_analysis": "이 원칙들을 지키지 않았을 때의 구체적인 영향 (정량적 수치 포함)",
    "success_factors": "이 원칙들이 중요한 이유와 성공 사례",
    "implementation_guide": "실제 구현 시 주의점과 체크리스트"
  }
}

예시:
{
  "summary": "선택된 디자인은 Simplicity와 One Thing per One Page 원칙에서 심각한 위반사항이 발견되었습니다. 특히 한 화면에 너무 많은 정보를 담아 사용자의 인지 부담이 크게 증가했습니다.",
  "violations": [
    ["송금 화면", "Simplicity", "한 화면에 8개의 입력 필드와 3개의 툴팁이 혼재", "높음", "핵심 3개 필드만 남기고 나머지는 '추가 설정'으로 이동", "기존 사례에서 입력 필드 축소 시 완료율 68%→82% 증가"]
  ],
  "compliances": [
    ["메인 헤더", "Casual Concept", "'계좌이체' 대신 '돈 보내기'로 친숙한 용어 사용", "높음", "유사 개선으로 신규 사용자 이탈률 22%→15% 감소"]
  ],
  "recommendations": [
    ["높음", "송금 화면 단순화", "사용자 만족도 증가", "유사 프로젝트에서 평균 작업 시간 46초→29초 감소"]
  ],
  "insights": {
    "impact_analysis": "단순성 원칙 위반 시 송금 완료율 75%→61% 하락, 작업 시간 81% 증가, 이탈률 175% 증가가 관찰됨",
    "success_factors": "직관적인 용어 사용과 단순한 UI는 신규 사용자의 진입 장벽을 낮추고 전환율을 높이는 핵심 요소",
    "implementation_guide": "1) 모든 화면은 3초 내 주요 정보 인지 가능해야 함 2) 입력 필드는 3개 이하 유지 3) 전문 용어는 모두 일상적 표현으로 변환"
  }
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

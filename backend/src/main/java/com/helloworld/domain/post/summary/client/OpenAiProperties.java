package com.helloworld.domain.post.summary.client;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * OpenAI 연동 설정. 값은 환경변수로 주입한다(키를 코드·커밋에 두지 않는다).
 *
 * <p>{@code enabled}를 별도로 두는 이유: API 키가 없는 팀원의 로컬에서도 게시물 작성은
 * 정상 동작해야 한다. 꺼져 있으면 요약 단계를 통째로 건너뛰고, 게시물은 그대로 저장된다.
 */
@Getter
@Setter
@Component
@ConfigurationProperties(prefix = "openai")
public class OpenAiProperties {

    /** false면 요약을 만들지 않는다. 키가 비어 있으면 자동으로 꺼진 것처럼 동작한다. */
    private boolean enabled = true;

    private String apiKey;

    private String baseUrl = "https://api.openai.com/v1";

    /**
     * 모델 이름. 게시물마다 호출되므로 비용이 누적된다 —
     * 품질을 확인한 뒤 더 저렴한 모델로 내릴 수 있게 설정으로 뺐다.
     */
    private String model = "gpt-5.5";

    /**
     * README를 이 길이까지만 보낸다(문자 수).
     *
     * <p>긴 README를 통째로 보내면 토큰 비용이 선형으로 늘고 응답도 느려진다.
     * 프로젝트 소개는 대개 앞부분에 있고, 뒤쪽은 설치 방법·라이선스·기여 가이드라
     * 요약에 보탬이 되지 않는다.
     */
    private int maxReadmeChars = 12000;
}

package com.helloworld.global.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * {@code @Scheduled} 활성화.
 *
 * <p>이 어노테이션이 없으면 {@code @Scheduled} 메서드는 <b>아무 오류 없이 그냥 실행되지 않는다.</b>
 * 기동 로그에도 흔적이 남지 않아, "배치가 안 돈다"를 알아채는 데 하루가 걸린다.
 *
 * <p>기본 스케줄러 스레드는 1개다. 지금은 GitHub 잔디 동기화 하나뿐이라 충분하지만,
 * 오래 걸리는 배치가 더 붙으면 서로 실행을 밀어내므로 그때 풀 크기를 늘려야 한다
 * ({@code spring.task.scheduling.pool.size}).
 */
@Configuration
@EnableScheduling
public class SchedulingConfig {
}

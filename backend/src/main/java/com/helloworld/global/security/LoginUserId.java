package com.helloworld.global.security;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 컨트롤러 파라미터에 현재 로그인 사용자의 userId(Long)를 주입받기 위한 애노테이션.
 * 사용 예: public ... createPost(@LoginUserId Long userId, ...)
 *
 * 실제 주입은 {@link LoginUserIdArgumentResolver}가 담당한다.
 * 각 도메인 컨트롤러는 토큰/시큐리티를 몰라도 이 애노테이션만 붙이면 된다.
 */
@Target(ElementType.PARAMETER)
@Retention(RetentionPolicy.RUNTIME)
public @interface LoginUserId {
}

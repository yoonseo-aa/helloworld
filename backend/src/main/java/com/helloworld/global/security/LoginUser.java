package com.helloworld.global.security;

/**
 * SecurityContext에 심는 경량 principal.
 * stateless + JWT 환경에서 "현재 로그인 사용자"를 표현하는 최소 정보만 담는다.
 * UserDetails 같은 무거운 조회 없이 토큰 클레임(userId, role)만으로 구성한다.
 */
public record LoginUser(Long userId, String role) {
}

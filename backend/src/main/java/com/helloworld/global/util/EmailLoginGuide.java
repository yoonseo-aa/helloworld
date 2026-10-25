package com.helloworld.global.util;

/**
 * 이미 가입된 이메일 충돌 시, "그 계정이 가입한 수단"에 맞는 로그인 안내 메시지를 만든다.
 * 로컬 가입 ↔ 소셜 가입 어느 방향에서 충돌하든, 사용자에게 기존 계정의 로그인 방법을 알려준다.
 */
public final class EmailLoginGuide {

    private EmailLoginGuide() {
    }

    public static String messageFor(String authProvider) {
        if ("GOOGLE".equalsIgnoreCase(authProvider)) {
            return "이미 구글로 가입된 이메일입니다. 구글 로그인을 이용해주세요.";
        }
        // LOCAL 및 기타
        return "이미 가입된 이메일입니다. 이메일과 비밀번호로 로그인해주세요.";
    }
}

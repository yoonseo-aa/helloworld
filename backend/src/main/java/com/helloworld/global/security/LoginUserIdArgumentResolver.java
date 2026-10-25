package com.helloworld.global.security;

import com.helloworld.global.exception.BusinessException;
import com.helloworld.global.exception.ErrorCode;
import org.springframework.core.MethodParameter;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

/**
 * {@link LoginUserId}가 붙은 Long 파라미터에 SecurityContext의 principal(LoginUser)에서
 * userId만 꺼내 주입한다.
 *
 * 인증 정보가 없으면(비로그인/토큰 없음) BusinessException(AUTH_UNAUTHORIZED)을 던지고,
 * GlobalExceptionHandler가 ApiResponse 에러 포맷으로 변환한다.
 * WebConfig에서 리졸버로 등록해야 동작한다.
 */
@Component
public class LoginUserIdArgumentResolver implements HandlerMethodArgumentResolver {

    @Override
    public boolean supportsParameter(MethodParameter parameter) {
        return parameter.hasParameterAnnotation(LoginUserId.class)
                && Long.class.equals(parameter.getParameterType());
    }

    @Override
    public Object resolveArgument(MethodParameter parameter,
                                  ModelAndViewContainer mavContainer,
                                  NativeWebRequest webRequest,
                                  WebDataBinderFactory binderFactory) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof LoginUser loginUser)) {
            throw new BusinessException(ErrorCode.AUTH_UNAUTHORIZED);
        }
        return loginUser.userId();
    }
}

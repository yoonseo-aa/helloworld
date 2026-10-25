package com.helloworld.global.mybatis;

import org.apache.ibatis.type.BaseTypeHandler;
import org.apache.ibatis.type.JdbcType;

import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Arrays;
import java.util.List;

/**
 * GROUP_CONCAT 등으로 콤마(,)로 이어진 문자열 컬럼을 {@code List<String>}으로 매핑하는 MyBatis 타입 핸들러.
 *
 * <p>검색의 {@code matched_stacks}(한 게시물에서 검색어와 매칭된 태그명 목록)처럼,
 * 한 행에 다중값을 담아 내려줄 때 쓴다. 조회 결과 매핑 전용으로 설계했다.
 *
 * <p>빈 값/NULL이면 null을 반환해 응답에서 필드가 생략(전역 non_null)되게 한다.
 * 구분자는 콤마다 — 태그명(기술스택 식별자)에는 콤마가 없다는 전제이며, 태그 명명 규칙이 바뀌면 재검토한다.
 */
public class CsvStringListTypeHandler extends BaseTypeHandler<List<String>> {

    @Override
    public void setNonNullParameter(PreparedStatement ps, int i, List<String> parameter, JdbcType jdbcType)
            throws SQLException {
        // 파라미터 바인딩 용도는 아니지만, BaseTypeHandler 계약상 구현해 둔다(콤마 join).
        ps.setString(i, String.join(",", parameter));
    }

    @Override
    public List<String> getNullableResult(ResultSet rs, String columnName) throws SQLException {
        return split(rs.getString(columnName));
    }

    @Override
    public List<String> getNullableResult(ResultSet rs, int columnIndex) throws SQLException {
        return split(rs.getString(columnIndex));
    }

    @Override
    public List<String> getNullableResult(CallableStatement cs, int columnIndex) throws SQLException {
        return split(cs.getString(columnIndex));
    }

    /** 콤마로 이어진 문자열을 분해해 공백 항목을 제거한 목록으로. 빈 값이면 null(응답에서 생략). */
    private List<String> split(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        return Arrays.stream(raw.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toList();
    }
}
